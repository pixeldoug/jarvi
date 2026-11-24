import SwiftUI
import WatchKit

/// The whole main screen, one list: the microphone on top (speak a task),
/// then, a turn of the crown below, chips for today's, upcoming, overdue and
/// spoken-here tasks, and the chosen ones. The rows are read-only on
/// purpose; a tap opens the task, and completing happens there.
struct HomeList: View {
  /// The chips under the microphone, like the iPhone's sections, plus the
  /// tasks spoken on this watch.
  enum Filter: String, CaseIterable, Identifiable {
    case today
    case upcoming
    case overdue
    case fromWatch

    var id: String { rawValue }

    var title: LocalizedStringKey {
      switch self {
      case .today: "Hoje"
      case .upcoming: "Próximas"
      case .overdue: "Vencidas"
      case .fromWatch: "Do relógio"
      }
    }
  }

  @ObservedObject var model: TasksModel
  let api: TaskAPI
  let speak: () -> Void
  /// Pull to refresh: the list, and any recordings waiting to be sent.
  let refresh: () async -> Void
  /// The chosen chip, kept between launches.
  @AppStorage("watch.listFilter") private var filter: Filter = .today

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
        let sections = model.sections
        Section {
          chips(sections)
        }
        taskSections(sections)
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

  /// No scroll view: a horizontal one takes the crown once touched, and the
  /// crown must always scroll the tasks. The chips wrap to a second line
  /// instead, and only a tap changes them.
  private func chips(_ sections: TodayTasks.Sections) -> some View {
    ChipFlow(spacing: 6) {
      ForEach(Filter.allCases) { option in
        chip(option, count: count(option, in: sections))
      }
    }
    .padding(.horizontal, 2)
    .listRowBackground(Color.clear)
    .listRowInsets(EdgeInsets())
  }

  private func chip(_ option: Filter, count: Int) -> some View {
    let selected = option == filter
    return Button {
      filter = option
    } label: {
      HStack(spacing: 4) {
        Text(option.title)
        if count > 0 {
          Text(count, format: .number)
            .foregroundStyle(selected ? Color.white.opacity(0.8) : Color.secondary)
        }
      }
      .font(.footnote.weight(.semibold))
      .foregroundStyle(selected ? Color.white : Color.primary)
      .padding(.horizontal, 10)
      .padding(.vertical, 6)
      .background(
        Capsule().fill(selected ? AnyShapeStyle(Color.accentColor) : AnyShapeStyle(.fill.tertiary))
      )
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(selected ? .isSelected : [])
  }

  /// Open tasks per chip (today's done ones don't count).
  private func count(_ option: Filter, in sections: TodayTasks.Sections) -> Int {
    switch option {
    case .overdue: sections.overdue.count
    case .today: sections.today.filter { !$0.completed }.count
    case .upcoming: sections.upcoming.count
    case .fromWatch: sections.fromWatch.count
    }
  }

  @ViewBuilder
  private func taskSections(_ sections: TodayTasks.Sections) -> some View {
    switch filter {
    case .overdue:
      if sections.overdue.isEmpty {
        empty("Nada vencido.")
      } else {
        Section {
          ForEach(sections.overdue) { task in
            row(task, showDate: true)
          }
        }
      }
    case .today:
      if sections.today.isEmpty {
        empty("Nada para hoje.", hint: "Fale uma tarefa e ela aparece aqui.")
      } else {
        Section {
          ForEach(sections.today) { task in
            row(task, showDate: false)
          }
        }
      }
    case .upcoming:
      if sections.upcoming.isEmpty {
        empty("Nada nos próximos dias.")
      } else {
        // One section per day, headed "Amanhã", "qua., 26 de nov."…
        ForEach(upcomingDays(sections.upcoming), id: \.key) { day in
          Section(TodayTasks.dayLabel(day.key)) {
            ForEach(day.tasks) { task in
              row(task, showDate: false)
            }
          }
        }
      }
    case .fromWatch:
      if sections.fromWatch.isEmpty {
        empty("Nada falado no relógio.", hint: "As tarefas que você fala aqui aparecem neste filtro.")
      } else {
        Section {
          ForEach(sections.fromWatch) { task in
            row(task, showDate: true)
          }
        }
      }
    }
  }

  private func upcomingDays(_ tasks: [WatchTask]) -> [(key: String, tasks: [WatchTask])] {
    var days: [(key: String, tasks: [WatchTask])] = []
    for task in tasks {
      guard let key = task.dateKey else { continue }
      if days.last?.key == key {
        days[days.count - 1].tasks.append(task)
      } else {
        days.append((key, [task]))
      }
    }
    return days
  }

  private func empty(_ title: LocalizedStringKey, hint: LocalizedStringKey? = nil) -> some View {
    Section {
      VStack(alignment: .leading, spacing: 2) {
        Text(title)
        if let hint {
          Text(hint)
            .font(.footnote)
            .foregroundStyle(.secondary)
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

/// Chips side by side, wrapping to a new line when the row is full.
private struct ChipFlow: Layout {
  var spacing: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let rows = arrange(subviews, width: proposal.width ?? .infinity)
    let height = rows.map(\.height).reduce(0, +) + spacing * CGFloat(max(rows.count - 1, 0))
    let width = rows.map(\.width).max() ?? 0
    return CGSize(width: proposal.width ?? width, height: height)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    var y = bounds.minY
    for row in arrange(subviews, width: bounds.width) {
      var x = bounds.minX
      for index in row.indices {
        let size = subviews[index].sizeThatFits(.unspecified)
        subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
        x += size.width + spacing
      }
      y += row.height + spacing
    }
  }

  private struct Row {
    var indices: [Int] = []
    var width: CGFloat = 0
    var height: CGFloat = 0
  }

  private func arrange(_ subviews: Subviews, width: CGFloat) -> [Row] {
    var rows: [Row] = []
    var current = Row()
    for index in subviews.indices {
      let size = subviews[index].sizeThatFits(.unspecified)
      let needed = current.indices.isEmpty ? size.width : current.width + spacing + size.width
      if needed > width, !current.indices.isEmpty {
        rows.append(current)
        current = Row(indices: [index], width: size.width, height: size.height)
      } else {
        current.indices.append(index)
        current.width = needed
        current.height = max(current.height, size.height)
      }
    }
    if !current.indices.isEmpty { rows.append(current) }
    return rows
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
