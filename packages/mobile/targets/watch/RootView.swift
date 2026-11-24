import SwiftUI

/// Voice first: one list that opens on the microphone (speak a task); turning
/// the crown scrolls to the day's tasks (see them); a task's detail completes
/// it. One plain List in one NavigationStack: nested stacks in a paged
/// TabView rendered the second page black on a real watch.
struct RootView: View {
  @EnvironmentObject private var session: SessionStore
  @StateObject private var model = TasksModel()
  @StateObject private var capture = VoiceCapture()
  @ObservedObject private var launch = VoiceLaunch.shared
  @ObservedObject private var outbox = VoiceOutbox.shared
  @StateObject private var connectivity = Connectivity()
  @Environment(\.scenePhase) private var scenePhase

  private var api: TaskAPI? {
    guard let token = session.token, let url = session.apiURL else { return nil }
    return TaskAPI(baseURL: url, token: token, locale: session.locale)
  }

  var body: some View {
    NavigationStack {
      Group {
        if let api {
          if case .failed(let error) = model.status, error == .signedOut || error == .subscriptionRequired {
            // Speaking can't work either: the server refuses this session.
            MessageView(systemImage: error.systemImage, text: error.message) {
              Task { await refresh(api) }
            }
          } else {
            HomeList(model: model, api: api, speak: { speak(api) }, refresh: { await refresh(api) })
              .navigationDestination(for: String.self) { id in
                TaskDetailView(model: model, api: api, taskID: id)
              }
          }
        } else {
          MessageView(systemImage: "iphone", text: "Abra a Jarvi no iPhone para entrar.")
        }
      }
      .navigationTitle("Jarvi")
    }
    .fullScreenCover(isPresented: Binding(get: { capture.isPresented }, set: { if !$0 { capture.close() } })) {
      if let api {
        CaptureView(
          capture: capture,
          recorder: capture.recorder,
          api: api,
          speakAgain: { speak(api) },
          onUndone: { Task { await model.load(api) } }
        )
      }
    }
    .task(id: session.token) {
      // A new session (another account, or signed out) starts from an empty list.
      model.switchSession(to: session.token, owner: api?.accountID)
      capture.close()
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
    speak(api)
  }

  /// The list, plus anything said while offline that can be sent now. Each
  /// recording goes out with its own account's session (`api.accountID`).
  private func refresh(_ api: TaskAPI) async {
    await model.refresh(api)
    let created = await outbox.flush(api: api)
    if created > 0 { await model.load(api) }
  }
}

private struct RetryKey: Equatable {
  let token: String?
  let active: Bool
  let waiting: Bool
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
    case .rateLimited: "Muitas tentativas. Tente de novo em alguns minutos."
    }
  }

  var systemImage: String {
    switch self {
    case .signedOut: "iphone"
    case .subscriptionRequired: "lock"
    case .network: "wifi.slash"
    case .server: "exclamationmark.triangle"
    case .noSpeech: "mic.slash"
    case .rateLimited: "hourglass"
    }
  }
}
