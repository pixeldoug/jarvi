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

  /// Call when the session changes: forgets everything from the previous one.
  func switchSession(to token: String?) {
    guard token != sessionToken else { return }
    sessionToken = token
    loadGeneration += 1
    tasks = []
    status = .loading
    busyIDs = []
    pendingCompletion = [:]
    actionError = nil
  }

  func load(_ api: TaskAPI) async {
    guard api.token == sessionToken else { return }
    loadGeneration += 1
    let generation = loadGeneration
    if tasks.isEmpty { status = .loading }
    do {
      let fresh = try await api.list()
      guard generation == loadGeneration, api.token == sessionToken else { return }
      tasks = fresh.map { task in
        var task = task
        if let completed = pendingCompletion[task.id] { task.completed = completed }
        return task
      }
      status = .ready
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
