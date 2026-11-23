import SwiftUI

/// Voice first: the app opens on the microphone (speak a task); turning the
/// crown goes to the day's list (see tasks); a task's detail completes it.
struct RootView: View {
  enum Page: Hashable {
    case speak
    case tasks
  }

  @EnvironmentObject private var session: SessionStore
  @StateObject private var model = TasksModel()
  @StateObject private var capture = VoiceCapture()
  @ObservedObject private var launch = VoiceLaunch.shared
  @ObservedObject private var outbox = VoiceOutbox.shared
  @StateObject private var connectivity = Connectivity()
  @Environment(\.scenePhase) private var scenePhase
  @State private var page = Page.speak

  private var api: TaskAPI? {
    guard let token = session.token, let url = session.apiURL else { return nil }
    return TaskAPI(baseURL: url, token: token)
  }

  var body: some View {
    Group {
      if let api {
        TabView(selection: $page) {
          HomeView(openToday: model.openToday, speak: { speak(api) }, showTasks: { page = .tasks })
            .tag(Page.speak)
          TaskListView(model: model, api: api, speak: { speak(api) }, refresh: { await refresh(api) })
            .tag(Page.tasks)
        }
        .tabViewStyle(.verticalPage)
        .fullScreenCover(isPresented: Binding(get: { capture.isPresented }, set: { if !$0 { capture.close() } })) {
          CaptureView(
            capture: capture,
            recorder: capture.recorder,
            api: api,
            speakAgain: { speak(api) },
            onUndone: { Task { await model.load(api) } }
          )
        }
      } else {
        NavigationStack {
          MessageView(systemImage: "iphone", text: "Abra a Jarvi no iPhone para entrar.")
            .navigationTitle("Jarvi")
        }
      }
    }
    .task(id: session.token) {
      // A new session (another account, or signed out) starts from an empty list.
      model.switchSession(to: session.token)
      capture.close()
      page = .speak
      if let api {
        startIfRequested(api)
        await refresh(api)
      }
    }
    .onChange(of: scenePhase) { _, phase in
      guard phase == .active, let api else { return }
      Task { await refresh(api) }
    }
    // Recordings kept offline go out as soon as the connection is back…
    .onChange(of: connectivity.isOnline) { _, online in
      guard online, scenePhase == .active, let api else { return }
      Task { await refresh(api) }
    }
    // …and are retried every 20 s while the app is open and any are waiting.
    .task(id: RetryKey(token: session.token, active: scenePhase == .active, waiting: waitingRecordings)) {
      guard scenePhase == .active, waitingRecordings, let api else { return }
      while !Task.isCancelled {
        try? await Task.sleep(for: .seconds(20))
        guard !Task.isCancelled else { return }
        await refresh(api)
      }
    }
    .onChange(of: launch.requested) { _, requested in
      if requested, let api { startIfRequested(api) }
    }
    .onOpenURL { launch.handle($0) }
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

  /// Recordings of the signed-in account still to be sent (another account's
  /// wait for that account to sign in again).
  private var waitingRecordings: Bool {
    guard let owner = api?.accountID else { return false }
    return outbox.items.contains { $0.owner == owner }
  }

  private func speak(_ api: TaskAPI) {
    capture.start(api: api) {
      Task { await model.load(api) }
    }
  }

  /// Complication, Smart Stack, Siri or Action button: open already listening.
  private func startIfRequested(_ api: TaskAPI) {
    guard launch.requested else { return }
    launch.requested = false
    page = .speak
    speak(api)
  }

  /// The list, plus anything said while offline that can be sent now. Each
  /// recording goes out with its own account's session (`api.accountID`).
  private func refresh(_ api: TaskAPI) async {
    await model.load(api)
    let created = await outbox.flush(api: api)
    if created > 0 { await model.load(api) }
  }
}

private struct RetryKey: Equatable {
  let token: String?
  let active: Bool
  let waiting: Bool
}

/// The first page: one big button that starts listening.
private struct HomeView: View {
  /// Open tasks today, nil until the list has loaded.
  let openToday: Int?
  let speak: () -> Void
  let showTasks: () -> Void

  var body: some View {
    NavigationStack {
      GeometryReader { proxy in
        let size = min(96, proxy.size.height * 0.55)
        VStack(spacing: 6) {
          Spacer(minLength: 0)
          Button(action: speak) {
            Image(systemName: "mic.fill")
              .font(.system(size: size * 0.42, weight: .semibold))
              .foregroundStyle(.white)
              .frame(width: size, height: size)
              .background(Circle().fill(Color.accentColor))
          }
          .buttonStyle(.plain)
          .accessibilityLabel(Text("Falar uma tarefa"))
          Text("Toque e fale")
            .font(.headline)
          Spacer(minLength: 0)
          if let openToday {
            Button(action: showTasks) {
              HStack(spacing: 4) {
                Text(summary(openToday))
                Image(systemName: "chevron.down")
                  .font(.footnote.weight(.semibold))
                  .foregroundStyle(.secondary)
              }
              .font(.footnote.weight(.medium))
              .padding(.horizontal, 12)
              .padding(.vertical, 7)
              .background(.fill.tertiary, in: Capsule())
            }
            .buttonStyle(.plain)
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
      .navigationTitle("Jarvi")
    }
  }

  private func summary(_ count: Int) -> LocalizedStringKey {
    switch count {
    case 0: "Hoje · nada aberto"
    case 1: "Hoje · 1 aberta"
    default: "Hoje · \(count) abertas"
    }
  }
}

struct MessageView: View {
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
    case .noSpeech: "Não ouvi nada."
    }
  }

  var systemImage: String {
    switch self {
    case .signedOut: "iphone"
    case .subscriptionRequired: "lock"
    case .network: "wifi.slash"
    case .server: "exclamationmark.triangle"
    case .noSpeech: "mic.slash"
    }
  }
}
