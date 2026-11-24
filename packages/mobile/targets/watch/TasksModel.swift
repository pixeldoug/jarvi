import Foundation

@MainActor
final class TasksModel: ObservableObject {
  enum Status: Equatable {
    case loading
    case ready
    case failed(TaskAPIError)
  }

  @Published private(set) var tasks: [WatchTask] = []
  @Published private(set) var status: Status = .loading
  /// Tasks with a toggle in flight (their button is disabled).
  @Published private(set) var busyIDs: Set<String> = []
  /// A toggle that failed; shown as an alert.
  @Published var actionError: TaskAPIError?

  /// The session the state belongs to. Results of requests made with another
  /// token are dropped, so one account never shows another's tasks.
  private var sessionToken: String?
  /// Bumped by every `load`; only the latest one may replace the list.
  private var loadGeneration = 0
  /// Completion state of toggles still in flight, applied over any list that
  /// arrives meanwhile (a read started before the toggle would undo it).
  private var pendingCompletion: [String: Bool] = [:]

  var sections: TodayTasks.Sections { TodayTasks.sections(from: tasks) }

  /// The generation of the load running now. `refresh` doesn't start a
  /// second one for the same session (both would download the list over
  /// the watch's slow link at once). A load from an older session or an
  /// older generation doesn't count: its result is dropped anyway.
  private var runningGeneration: Int?
  /// The account the list belongs to, for the cache.
  private var owner: String?

  /// Call when the session changes: forgets everything from the previous one
  /// and shows the last list saved for this account at once (it is refreshed
  /// right after). Signing out deletes the saved lists.
  func switchSession(to token: String?, owner: String?) {
    guard token != sessionToken else { return }
    sessionToken = token
    self.owner = owner
    loadGeneration += 1
    busyIDs = []
    pendingCompletion = [:]
    actionError = nil
    if token == nil { TaskListCache.clear() }
    if let owner, let cached = TaskListCache.read(owner: owner) {
      tasks = cached
      status = .ready
    } else {
      tasks = []
      status = .loading
    }
  }

  /// A load unless one is already running (opening the app, coming back to
  /// it, pull to refresh).
  func refresh(_ api: TaskAPI) async {
    guard runningGeneration != loadGeneration else { return }
    await load(api)
  }

  /// Always asks the server (after a change: a fresh read must win).
  func load(_ api: TaskAPI) async {
    guard api.token == sessionToken else { return }
    loadGeneration += 1
    let generation = loadGeneration
    if tasks.isEmpty { status = .loading }
    runningGeneration = generation
    defer { if runningGeneration == generation { runningGeneration = nil } }
    do {
      let fresh = try await api.list()
      guard generation == loadGeneration, api.token == sessionToken else { return }
      tasks = fresh.map { task in
        var task = task
        if let completed = pendingCompletion[task.id] { task.completed = completed }
        return task
      }
      status = .ready
      if let owner { TaskListCache.write(fresh, owner: owner) }
    } catch {
      guard generation == loadGeneration, api.token == sessionToken else { return }
      let failure = TaskAPIError(error)
      if failure == .signedOut || failure == .subscriptionRequired || tasks.isEmpty {
        tasks = []
        status = .failed(failure)
      }
      // A failed refresh keeps the list on screen.
    }
  }

  /// Optimistic: the checkmark changes at once and comes back if the server refuses.
  func toggle(_ task: WatchTask, api: TaskAPI) async -> Bool {
    guard api.token == sessionToken, !busyIDs.contains(task.id) else { return false }
    busyIDs.insert(task.id)
    pendingCompletion[task.id] = !task.completed
    setCompleted(!task.completed, for: task.id)

    var succeeded = true
    do {
      try await api.toggle(id: task.id)
    } catch {
      succeeded = false
      if api.token == sessionToken {
        setCompleted(task.completed, for: task.id)
        actionError = TaskAPIError(error)
      }
    }
    guard api.token == sessionToken else { return false }
    busyIDs.remove(task.id)
    pendingCompletion[task.id] = nil
    // Lists read before the toggle are now stale; a recurring task also
    // creates its next occurrence on the server.
    if succeeded { await load(api) }
    return succeeded
  }

  private func setCompleted(_ completed: Bool, for id: String) {
    guard let index = tasks.firstIndex(where: { $0.id == id }) else { return }
    tasks[index].completed = completed
  }
}

/// The last list per account, in Application Support, so opening the app
/// shows tasks at once instead of waiting for the network.
enum TaskListCache {
  private static var folder: URL {
    FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("TaskListCache", isDirectory: true)
  }

  private static func url(owner: String) -> URL {
    let name = owner.unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) || $0 == "-" }
    return folder.appendingPathComponent(String(String.UnicodeScalarView(name)) + ".json")
  }

  static func read(owner: String) -> [WatchTask]? {
    guard !owner.isEmpty, let data = try? Data(contentsOf: url(owner: owner)) else { return nil }
    return try? JSONDecoder().decode([WatchTask].self, from: data)
  }

  static func write(_ tasks: [WatchTask], owner: String) {
    guard !owner.isEmpty, let data = try? JSONEncoder().encode(tasks) else { return }
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    try? data.write(to: url(owner: owner), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
  }

  static func clear() {
    try? FileManager.default.removeItem(at: folder)
  }
}
