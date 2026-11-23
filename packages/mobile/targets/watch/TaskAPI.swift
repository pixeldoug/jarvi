import Foundation

enum TaskAPIError: Error, Equatable {
  /// The token is missing, expired or invalid: the iPhone has to sign in again.
  case signedOut
  /// The paywall (`code: 'SUBSCRIPTION_REQUIRED'`).
  case subscriptionRequired
  case network
  case server
  /// A recording with no speech in it (POST /api/tasks/voice answers 422).
  case noSpeech

  init(_ error: Error) {
    if let error = error as? TaskAPIError {
      self = error
    } else if error is URLError {
      self = .network
    } else {
      self = .server
    }
  }
}

/// The task routes the watch uses (packages/backend/src/routes/taskRoutes.ts),
/// with the same rules as src/api/client.ts in the iPhone app.
struct TaskAPI {
  let baseURL: URL
  let token: String

  func list() async throws -> [WatchTask] {
    let data = try await send("GET", "/api/tasks")
    do {
      return try JSONDecoder().decode([WatchTask].self, from: data)
    } catch {
      throw TaskAPIError.server
    }
  }

  func toggle(id: String) async throws {
    _ = try await send("PATCH", "/api/tasks/\(id)/toggle", body: [:])
  }

  /// A task for `dueDate` (YYYY-MM-DD), without time.
  func create(title: String, dueDate: String) async throws {
    _ = try await send("POST", "/api/tasks", body: ["title": title, "dueDate": dueDate, "important": false])
  }

  /// The watch's main action: the server transcribes the recording and makes
  /// it a task (title, day and time). `clientID` becomes the task id, so
  /// sending the same recording again returns the task it already created.
  /// `today`/`now` are the watch's clock, so "amanhã" is the user's tomorrow.
  func createFromVoice(audio: Data, mimeType: String, clientID: UUID, today: String, now: String) async throws -> VoiceTaskResult {
    let data = try await send(
      "POST",
      "/api/tasks/voice",
      body: [
        "audio": audio.base64EncodedString(),
        "mimeType": mimeType,
        "clientId": clientID.uuidString.lowercased(),
        "today": today,
        "now": now,
      ],
      timeout: 60
    )
    do {
      return try JSONDecoder().decode(VoiceTaskResult.self, from: data)
    } catch {
      throw TaskAPIError.server
    }
  }

  /// Undo of a task just created by voice.
  func delete(id: String) async throws {
    _ = try await send("DELETE", "/api/tasks/\(id)")
  }

  private func send(_ method: String, _ path: String, body: [String: Any]? = nil, timeout: TimeInterval = 20) async throws -> Data {
    guard let url = URL(string: path, relativeTo: baseURL) else { throw TaskAPIError.server }
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.timeoutInterval = timeout
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue(Self.localeHeader, forHTTPHeaderField: "X-Jarvi-Locale")
    if let body {
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = try JSONSerialization.data(withJSONObject: body)
    }

    let data: Data
    let response: URLResponse
    do {
      (data, response) = try await URLSession.shared.data(for: request)
    } catch {
      throw TaskAPIError.network
    }
    guard let http = response as? HTTPURLResponse else { throw TaskAPIError.server }
    if (200..<300).contains(http.statusCode) { return data }

    let payload = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
    let code = payload["code"] as? String
    let message = payload["error"] as? String
    // isSessionRejection / isSubscriptionRequired in src/api/client.ts (old backend sends no code).
    if http.statusCode == 401 || (http.statusCode == 403 && (code == "INVALID_TOKEN" || message == "Invalid token")) {
      throw TaskAPIError.signedOut
    }
    if http.statusCode == 403 && (code == "SUBSCRIPTION_REQUIRED" || message == "subscription_required") {
      throw TaskAPIError.subscriptionRequired
    }
    if http.statusCode == 422 && message == "no_speech" {
      throw TaskAPIError.noSpeech
    }
    throw TaskAPIError.server
  }

  /// The language the watch UI is showing.
  private static var localeHeader: String {
    Bundle.main.preferredLocalizations.first == "en" ? "en-US" : "pt-BR"
  }
}

/// What POST /api/tasks/voice answers: the task, and what was heard (nil when
/// the recording had already been sent before).
struct VoiceTaskResult: Decodable {
  let task: WatchTask
  let transcript: String?
}
