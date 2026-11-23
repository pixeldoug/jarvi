import SwiftUI
import WatchKit

/// The second page: overdue and today's tasks. Read-only on purpose; a tap
/// opens the task, and completing it happens there.
struct TaskListView: View {
  @ObservedObject var model: TasksModel
  let api: TaskAPI
  let speak: () -> Void

  var body: some View {
    NavigationStack {
      content
        .navigationTitle("Hoje")
        .navigationDestination(for: String.self) { id in
          TaskDetailView(model: model, api: api, taskID: id)
        }
        .toolbar {
          ToolbarItem(placement: .topBarLeading) {
            Button(action: speak) {
              Image(systemName: "mic.fill")
            }
            .tint(.accentColor)
            .accessibilityLabel(Text("Falar uma tarefa"))
          }
        }
    }
  }

  @ViewBuilder
  private var content: some View {
    switch model.status {
    case .loading where model.tasks.isEmpty:
      ProgressView()
    case .failed(let error):
      MessageView(systemImage: error.systemImage, text: error.message) {
        Task { await model.load(api) }
      }
    default:
      list
    }
  }

  @ViewBuilder
  private var list: some View {
    let sections = model.sections
    if sections.overdue.isEmpty && sections.today.isEmpty {
      ScrollView {
        VStack(spacing: 6) {
          Text("Nada para hoje.")
            .font(.headline)
          Text("Fale uma tarefa e ela aparece aqui.")
            .font(.footnote)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
          Button("Falar tarefa", action: speak)
            .buttonStyle(.borderedProminent)
            .tint(.accentColor)
            .padding(.top, 8)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 12)
      }
      .refreshable { await model.load(api) }
    } else {
      List {
        if !sections.overdue.isEmpty {
          Section("Vencidas") {
            ForEach(sections.overdue) { task in
              row(task, showDate: true)
            }
          }
        }
        Section("Hoje") {
          if sections.today.isEmpty {
            Text("Nada para hoje.")
              .foregroundStyle(.secondary)
          } else {
            ForEach(sections.today) { task in
              row(task, showDate: false)
            }
          }
        }
      }
      .refreshable { await model.load(api) }
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
