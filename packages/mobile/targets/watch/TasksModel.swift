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
  /// A toggle or a new task that failed; shown as an alert.
  @Published var actionError: TaskAPIError?

  var sections: TodayTasks.Sections { TodayTasks.sections(from: tasks) }

  func load(_ api: TaskAPI) async {
    if tasks.isEmpty { status = .loading }
    do {
      tasks = try await api.list()
      status = .ready
    } catch {
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
    guard !busyIDs.contains(task.id) else { return false }
    busyIDs.insert(task.id)
    defer { busyIDs.remove(task.id) }
    setCompleted(!task.completed, for: task.id)
    do {
      try await api.toggle(id: task.id)
    } catch {
      setCompleted(task.completed, for: task.id)
      actionError = TaskAPIError(error)
      return false
    }
    // A recurring task creates its next occurrence on the server.
    await load(api)
    return true
  }

  func create(title: String, dueDate: String, api: TaskAPI) async -> Bool {
    do {
      try await api.create(title: title, dueDate: dueDate)
    } catch {
      actionError = TaskAPIError(error)
      return false
    }
    await load(api)
    return true
  }

  private func setCompleted(_ completed: Bool, for id: String) {
    guard let index = tasks.firstIndex(where: { $0.id == id }) else { return }
    tasks[index].completed = completed
  }
}
