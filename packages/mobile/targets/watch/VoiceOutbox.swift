import Foundation

/// Recordings waiting to be sent (made with no connection, or the server was
/// down). They live in Application Support until the server has made them a
/// task, so a spoken task is never lost. Each one keeps the id it was given
/// when recorded: the server uses it as the task id, so a retry never creates
/// a second task.
@MainActor
final class VoiceOutbox: ObservableObject {
  struct Item: Codable, Identifiable, Equatable {
    let id: UUID
    let fileName: String
    /// The account it was recorded on (JWT `id`); never sent to another one.
    let owner: String
    /// The watch's date and time when it was said ("amanhã" is relative to it).
    let today: String
    let now: String
    let recordedAt: Date
    var attempts: Int
    /// After a server error, not retried before this (growing wait).
    var nextAttemptAt: Date?
  }

  static let shared = VoiceOutbox()

  /// Server errors before giving up on a recording. With `backoff` that is
  /// about three hours of retries, not five quick ones in a row.
  private static let maxAttempts = 6
  /// Wait after the nth server error: 30 s, 2 min, 8 min, 32 min, 2 h.
  private static func backoff(after attempts: Int) -> TimeInterval {
    min(30 * pow(4, Double(max(attempts - 1, 0))), 2 * 60 * 60)
  }
  /// Older recordings are dropped: "amanhã" said a week ago is wrong anyway.
  private static let maxAge: TimeInterval = 7 * 24 * 60 * 60

  @Published private(set) var items: [Item] = []
  private var flushing = false
  /// After a 429, nothing is sent before this. Waiting for the server costs
  /// no attempts: being rate-limited never makes a recording expire.
  private var pausedUntil: Date?
  /// Uploads in flight, by recording. A second send of the same recording
  /// (the capture screen and a flush) waits for the first instead of
  /// uploading again: a duplicate still transcribing after "Desfazer" would
  /// create the task again.
  private var inFlight: [UUID: Task<VoiceTaskResult, Error>] = [:]

  private let folder: URL
  private var indexURL: URL { folder.appendingPathComponent("index.json") }

  init() {
    let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    folder = support.appendingPathComponent("VoiceOutbox", isDirectory: true)
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    if let data = try? Data(contentsOf: indexURL),
       let saved = try? JSONDecoder().decode([Item].self, from: data) {
      items = saved
    }
  }

  func fileURL(_ item: Item) -> URL { folder.appendingPathComponent(item.fileName) }

  /// Moves a finished recording in. Returns nil if it could not be kept.
  func add(recording: URL, id: UUID, owner: String, today: String, now: String) -> Item? {
    let name = "\(id.uuidString).m4a"
    let target = folder.appendingPathComponent(name)
    do {
      try? FileManager.default.removeItem(at: target)
      try FileManager.default.moveItem(at: recording, to: target)
    } catch {
      return nil
    }
    let item = Item(id: id, fileName: name, owner: owner, today: today, now: now, recordedAt: Date(), attempts: 0)
    items.append(item)
    save()
    return item
  }

  func remove(_ id: UUID) {
    guard let index = items.firstIndex(where: { $0.id == id }) else { return }
    try? FileManager.default.removeItem(at: fileURL(items[index]))
    items.remove(at: index)
    save()
  }

  /// One upload. Removes the recording once the server has it (or it can
  /// never become a task); keeps it when the problem is the connection.
  /// Only for `api`'s own account.
  func send(_ item: Item, api: TaskAPI) async throws -> VoiceTaskResult {
    if let running = inFlight[item.id] { return try await running.value }
    guard item.owner == api.accountID else { throw TaskAPIError.signedOut }
    let upload = Task { try await self.upload(item, api: api) }
    inFlight[item.id] = upload
    defer { inFlight[item.id] = nil }
    return try await upload.value
  }

  private func upload(_ item: Item, api: TaskAPI) async throws -> VoiceTaskResult {
    guard let audio = try? Data(contentsOf: fileURL(item)) else {
      remove(item.id)
      throw TaskAPIError.server
    }
    do {
      let result = try await api.createFromVoice(
        audio: audio,
        mimeType: VoiceRecorder.mimeType,
        clientID: item.id,
        today: item.today,
        now: item.now
      )
      remove(item.id)
      return result
    } catch {
      switch TaskAPIError(error) {
      case .noSpeech:
        remove(item.id)
      case .server:
        bumpAttempts(item.id)
      case .rateLimited(let retryAfter):
        pausedUntil = Date().addingTimeInterval(retryAfter)
      case .network, .signedOut, .subscriptionRequired:
        break
      }
      throw error
    }
  }

  /// Sends what is waiting for `api`'s account, oldest first, skipping the
  /// ones still waiting after a server error. Stops at the first connection
  /// problem or 429. Returns how many became tasks.
  @discardableResult
  func flush(api: TaskAPI) async -> Int {
    guard !flushing else { return 0 }
    if let pausedUntil, pausedUntil > Date() { return 0 }
    flushing = true
    defer { flushing = false }

    dropExpired()
    let owner = api.accountID
    var created = 0
    for item in items where item.owner == owner {
      // Sent meanwhile by the capture screen.
      guard let current = items.first(where: { $0.id == item.id }) else { continue }
      if let next = current.nextAttemptAt, next > Date() { continue }
      do {
        _ = try await send(item, api: api)
        created += 1
      } catch {
        switch TaskAPIError(error) {
        case .network, .signedOut, .subscriptionRequired, .rateLimited:
          return created
        case .server, .noSpeech:
          continue
        }
      }
    }
    return created
  }

  private func dropExpired() {
    let now = Date()
    for item in items where item.attempts >= Self.maxAttempts || now.timeIntervalSince(item.recordedAt) > Self.maxAge {
      remove(item.id)
    }
  }

  private func bumpAttempts(_ id: UUID) {
    guard let index = items.firstIndex(where: { $0.id == id }) else { return }
    items[index].attempts += 1
    items[index].nextAttemptAt = Date().addingTimeInterval(Self.backoff(after: items[index].attempts))
    save()
  }

  private func save() {
    guard let data = try? JSONEncoder().encode(items) else { return }
    try? data.write(to: indexURL, options: .atomic)
  }
}

extension TaskAPI {
  /// The account id inside this API's own token (JWT `id`). Taken from the
  /// token the request is sent with, so a recording is never sent with
  /// another account's session, even if the session changes mid-refresh.
  var accountID: String {
    let parts = token.split(separator: ".")
    guard parts.count == 3 else { return "" }
    var payload = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    payload += String(repeating: "=", count: (4 - payload.count % 4) % 4)
    guard let data = Data(base64Encoded: payload),
          let claims = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return "" }
    if let id = claims["id"] as? String { return id }
    if let id = claims["id"] as? Int { return String(id) }
    return ""
  }
}
