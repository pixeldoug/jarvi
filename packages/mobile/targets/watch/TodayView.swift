import SwiftUI
import WatchKit

/// The only screen: overdue and today's tasks, check them off, add one by voice.
struct TodayView: View {
  @EnvironmentObject private var session: SessionStore
  @StateObject private var model = TasksModel()
  @Environment(\.scenePhase) private var scenePhase
  @State private var draft = ""

  private var api: TaskAPI? {
    guard let token = session.token, let url = session.apiURL else { return nil }
    return TaskAPI(baseURL: url, token: token)
  }

  var body: some View {
    NavigationStack {
      Group {
        if let api {
          content(api)
        } else {
          MessageView(systemImage: "iphone", text: "Abra a Jarvi no iPhone para entrar.")
        }
      }
      .navigationTitle("Hoje")
    }
    .task(id: session.token) {
      if let api { await model.load(api) }
    }
    .onChange(of: scenePhase) { _, phase in
      guard phase == .active, let api else { return }
      Task { await model.load(api) }
    }
    .alert(
      "Não deu certo",
      isPresented: Binding(get: { model.actionError != nil }, set: { if !$0 { model.actionError = nil } }),
      presenting: model.actionError
    ) { _ in
      Button("OK", role: .cancel) {}
    } message: { error in
      Text(error.message)
    }
  }

  @ViewBuilder
  private func content(_ api: TaskAPI) -> some View {
    switch model.status {
    case .loading where model.tasks.isEmpty:
      ProgressView()
    case .failed(let error):
      MessageView(systemImage: error.systemImage, text: error.message) {
        Task { await model.load(api) }
      }
    default:
      list(api)
    }
  }

  private func list(_ api: TaskAPI) -> some View {
    let sections = model.sections
    return List {
      // Tapping opens the system input: dictation, Scribble or keyboard.
      TextField("Nova tarefa", text: $draft)
        .submitLabel(.done)
        .onSubmit { add(api) }

      if !sections.overdue.isEmpty {
        Section("Vencidas") {
          ForEach(sections.overdue) { task in
            row(task, api: api, showDate: true)
          }
        }
      }

      Section("Hoje") {
        if sections.today.isEmpty {
          Text("Nada para hoje.")
            .foregroundStyle(.secondary)
        } else {
          ForEach(sections.today) { task in
            row(task, api: api, showDate: false)
          }
        }
      }
    }
    .refreshable { await model.load(api) }
  }

  private func row(_ task: WatchTask, api: TaskAPI, showDate: Bool) -> some View {
    TaskRow(task: task, showDate: showDate, busy: model.busyIDs.contains(task.id)) {
      Task {
        if await model.toggle(task, api: api) {
          WKInterfaceDevice.current().play(task.completed ? .click : .success)
        }
      }
    }
  }

  private func add(_ api: TaskAPI) {
    let title = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    draft = ""
    guard !title.isEmpty else { return }
    Task {
      if await model.create(title: title, dueDate: TodayTasks.dateKey(Date()), api: api) {
        WKInterfaceDevice.current().play(.success)
      } else {
        // Give the text back so it can be sent again.
        draft = title
      }
    }
  }
}

private struct TaskRow: View {
  let task: WatchTask
  let showDate: Bool
  let busy: Bool
  let toggle: () -> Void

  var body: some View {
    Button(action: toggle) {
      HStack(alignment: .top, spacing: 8) {
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
    }
    .disabled(busy)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(task.title))
    .accessibilityValue(task.completed ? Text("Concluída") : Text("Pendente"))
    .accessibilityAddTraits(.isButton)
  }

  /// "14:30", or "12 nov · 14:30" for an overdue task.
  private var detail: String? {
    var parts: [String] = []
    if showDate, let key = task.dateKey { parts.append(TodayTasks.shortDate(key)) }
    if let time = task.time, !time.isEmpty { parts.append(time) }
    return parts.isEmpty ? nil : parts.joined(separator: " · ")
  }
}

private struct MessageView: View {
  let systemImage: String
  let text: LocalizedStringKey
  var retry: (() -> Void)?

  var body: some View {
    ScrollView {
      VStack(spacing: 8) {
        Image(systemName: systemImage)
          .font(.title2)
          .foregroundStyle(.secondary)
        Text(text)
          .multilineTextAlignment(.center)
        if let retry {
          Button("Tentar de novo", action: retry)
            .padding(.top, 4)
        }
      }
      .frame(maxWidth: .infinity)
      .padding(.top, 8)
    }
  }
}

extension TaskAPIError {
  var message: LocalizedStringKey {
    switch self {
    case .signedOut: "Abra a Jarvi no iPhone para entrar de novo."
    case .subscriptionRequired: "Sua assinatura não está ativa. Veja na Jarvi do iPhone."
    case .network: "Sem conexão. Tente de novo."
    case .server: "Algo deu errado. Tente de novo."
    }
  }

  var systemImage: String {
    switch self {
    case .signedOut: "iphone"
    case .subscriptionRequired: "lock"
    case .network: "wifi.slash"
    case .server: "exclamationmark.triangle"
    }
  }
}
