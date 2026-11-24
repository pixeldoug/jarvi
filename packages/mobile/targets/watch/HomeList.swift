import SwiftUI
import WatchKit

/// The whole main screen, one list: the microphone on top (speak a task),
/// then, a turn of the crown below, the overdue and today's tasks. The rows
/// are read-only on purpose; a tap opens the task, and completing happens
/// there.
struct HomeList: View {
  @ObservedObject var model: TasksModel
  let api: TaskAPI
  let speak: () -> Void
  /// Pull to refresh: the list, and any recordings waiting to be sent.
  let refresh: () async -> Void

  var body: some View {
    List {
      Section {
        micButton
      }

      switch model.status {
      case .loading where model.tasks.isEmpty:
        Section {
          ProgressView()
            .frame(maxWidth: .infinity)
            .listRowBackground(Color.clear)
        }
      case .failed(let error):
        // No list yet (no connection, server down). Speaking still works:
        // the recording waits on the watch.
        Section {
          VStack(spacing: 6) {
            Image(systemName: error.systemImage)
              .foregroundStyle(.secondary)
            Text(error.message)
              .font(.footnote)
              .multilineTextAlignment(.center)
          }
          .frame(maxWidth: .infinity)
          .listRowBackground(Color.clear)
          Button("Tentar de novo") {
            Task { await refresh() }
          }
        }
      default:
        taskSections
      }
    }
    .refreshable { await refresh() }
  }

  private var micButton: some View {
    Button(action: speak) {
      VStack(spacing: 6) {
        Image(systemName: "mic.fill")
          .font(.system(size: 34, weight: .semibold))
          .foregroundStyle(.white)
          .frame(width: 80, height: 80)
          .background(Circle().fill(Color.accentColor))
        Text("Toque e fale")
          .font(.headline)
      }
      .frame(maxWidth: .infinity)
      .padding(.vertical, 4)
    }
    .buttonStyle(.plain)
    .listRowBackground(Color.clear)
    .accessibilityLabel(Text("Falar uma tarefa"))
  }

  @ViewBuilder
  private var taskSections: some View {
    let sections = model.sections
    if !sections.overdue.isEmpty {
      Section("Vencidas") {
        ForEach(sections.overdue) { task in
          row(task, showDate: true)
        }
      }
    }
    Section("Hoje") {
      if sections.today.isEmpty {
        VStack(alignment: .leading, spacing: 2) {
          Text("Nada para hoje.")
          Text("Fale uma tarefa e ela aparece aqui.")
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
      } else {
        ForEach(sections.today) { task in
          row(task, showDate: false)
        }
      }
    }
  }

  private func row(_ task: WatchTask, showDate: Bool) -> some View {
    NavigationLink(value: task.id) {
      TaskRow(task: task, showDate: showDate, busy: model.busyIDs.contains(task.id))
    }
  }
}

private struct TaskRow: View {
  let task: WatchTask
  let showDate: Bool
  let busy: Bool

  var body: some View {
    HStack(alignment: .top, spacing: 8) {
      // Shows the state only; completing is in the task's detail.
      Image(systemName: task.completed ? "checkmark.circle.fill" : "circle")
        .font(.title3)
        .foregroundStyle(task.completed ? Color.accentColor : Color.secondary)
      VStack(alignment: .leading, spacing: 2) {
        Text(task.title)
          .strikethrough(task.completed)
          .foregroundStyle(task.completed ? Color.secondary : Color.primary)
          .lineLimit(3)
        if let detail {
          Text(detail)
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
      }
      Spacer(minLength: 0)
    }
    .opacity(busy ? 0.45 : 1)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(task.title))
    .accessibilityValue(task.completed ? Text("Concluída") : Text("Pendente"))
  }

  /// "14:30", or "12 nov · 14:30" for an overdue task.
  private var detail: String? {
    var parts: [String] = []
    if showDate, let key = task.dateKey { parts.append(TodayTasks.shortDate(key)) }
    if let time = task.time, !time.isEmpty { parts.append(time) }
    return parts.isEmpty ? nil : parts.joined(separator: " · ")
  }
}

/// One task: when it is, what it is, and the one action the watch allows.
struct TaskDetailView: View {
  @ObservedObject var model: TasksModel
  let api: TaskAPI
  let taskID: String
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    if let task = model.tasks.first(where: { $0.id == taskID }) {
      ScrollView {
        VStack(alignment: .leading, spacing: 4) {
          if let when = TodayTasks.whenLabel(task) {
            Text(when)
              .font(.footnote.weight(.medium))
              .foregroundStyle(.secondary)
          }
          Text(task.title)
            .font(.title3.weight(.semibold))
            .strikethrough(task.completed)
            .fixedSize(horizontal: false, vertical: true)
          actionButton(task)
            .padding(.top, 12)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
    } else {
      // Gone from the list (deleted elsewhere, or the session changed).
      Text("Nada para hoje.")
        .foregroundStyle(.secondary)
    }
  }

  @ViewBuilder
  private func actionButton(_ task: WatchTask) -> some View {
    let busy = model.busyIDs.contains(task.id)
    if task.completed {
      Button("Reabrir") { toggle(task) }
        .buttonStyle(.bordered)
        .disabled(busy)
    } else {
      Button("Concluir") { toggle(task) }
        .buttonStyle(.borderedProminent)
        .tint(.accentColor)
        .disabled(busy)
    }
  }

  private func toggle(_ task: WatchTask) {
    let wasCompleted = task.completed
    Task {
      if await model.toggle(task, api: api) {
        WKInterfaceDevice.current().play(wasCompleted ? .click : .success)
        dismiss()
      }
    }
  }
}
