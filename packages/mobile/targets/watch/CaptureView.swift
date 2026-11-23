import SwiftUI

/// Full screen while speaking a task: listening, sending, and what came of it.
/// The system close button (top left) cancels at any point.
struct CaptureView: View {
  @ObservedObject var capture: VoiceCapture
  @ObservedObject var recorder: VoiceRecorder
  let api: TaskAPI
  let speakAgain: () -> Void
  let onUndone: () -> Void

  /// How long the created screen stays before going back to the microphone.
  private static let createdDelay: Duration = .seconds(3)

  var body: some View {
    content
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .toolbar {
        if capture.phase == .listening {
          ToolbarItem(placement: .topBarTrailing) {
            Text(Duration.seconds(recorder.elapsed.rounded(.down)).formatted(.time(pattern: .minuteSecond)))
              .font(.footnote.monospacedDigit())
              .foregroundStyle(.secondary)
          }
        }
      }
      .task(id: capture.phase) {
        guard case .created = capture.phase else { return }
        try? await Task.sleep(for: Self.createdDelay)
        if !Task.isCancelled, !capture.undoing { capture.close() }
      }
  }

  @ViewBuilder
  private var content: some View {
    switch capture.phase {
    case .idle, .listening:
      listening
    case .sending:
      VStack(spacing: 10) {
        ProgressView()
        Text("Criando tarefa…")
      }
    case .created(let task, _):
      created(task)
    case .noSpeech:
      message(
        title: "Não ouvi nada.",
        detail: "Tente de novo, mais perto do relógio.",
        button: "Falar de novo",
        prominent: true,
        action: speakAgain
      )
    case .saved:
      message(
        systemImage: "clock",
        title: "Guardada",
        detail: "Envio assim que tiver conexão.",
        button: "OK",
        action: capture.close
      )
    case .micDenied:
      message(
        systemImage: "mic.slash",
        title: "Sem microfone",
        detail: "Permita o microfone para a Jarvi nos Ajustes do relógio.",
        button: "OK",
        action: capture.close
      )
    case .failed(let error):
      message(systemImage: error.systemImage, title: "Não deu certo", detailKey: error.message, button: "OK", action: capture.close)
    }
  }

  private var listening: some View {
    VStack(spacing: 8) {
      Spacer(minLength: 0)
      Text("Ouvindo…")
        .font(.title3.weight(.semibold))
      Waveform(levels: recorder.levels)
      Text("Diga a tarefa e, se quiser, o dia e a hora.")
        .font(.footnote)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
      Spacer(minLength: 0)
      Button(action: capture.finishListening) {
        RoundedRectangle(cornerRadius: 4)
          .fill(.white)
          .frame(width: 16, height: 16)
          .frame(width: 52, height: 52)
          .background(Circle().fill(Color.accentColor))
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text("Enviar"))
    }
  }

  private func created(_ task: WatchTask) -> some View {
    ScrollView {
      VStack(spacing: 6) {
        Image(systemName: "checkmark")
          .font(.system(size: 18, weight: .bold))
          .foregroundStyle(.white)
          .frame(width: 40, height: 40)
          .background(Circle().fill(Color.accentColor))
        Text(task.title)
          .font(.headline)
          .multilineTextAlignment(.center)
          .fixedSize(horizontal: false, vertical: true)
        if let when = TodayTasks.whenLabel(task) {
          Text(when)
            .font(.footnote.weight(.medium))
            .foregroundStyle(.secondary)
        }
        Button("Desfazer") {
          capture.undo(api: api, onUndone: onUndone)
        }
        .buttonStyle(.bordered)
        .disabled(capture.undoing)
        .padding(.top, 6)
      }
      .frame(maxWidth: .infinity)
    }
  }

  private func message(
    systemImage: String? = nil,
    title: LocalizedStringKey,
    detail: LocalizedStringKey? = nil,
    detailKey: LocalizedStringKey? = nil,
    button: LocalizedStringKey,
    prominent: Bool = false,
    action: @escaping () -> Void
  ) -> some View {
    ScrollView {
      VStack(spacing: 6) {
        if let systemImage {
          Image(systemName: systemImage)
            .font(.title3)
            .foregroundStyle(.secondary)
        }
        Text(title)
          .font(.headline)
        if let text = detail ?? detailKey {
          Text(text)
            .font(.footnote)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
        }
        Group {
          if prominent {
            Button(button, action: action)
              .buttonStyle(.borderedProminent)
              .tint(.accentColor)
          } else {
            Button(button, action: action)
              .buttonStyle(.bordered)
          }
        }
        .padding(.top, 8)
      }
      .frame(maxWidth: .infinity)
    }
  }
}

/// Live bars from the recorder's levels.
private struct Waveform: View {
  let levels: [Float]

  var body: some View {
    HStack(spacing: 4) {
      ForEach(Array(levels.enumerated()), id: \.offset) { _, level in
        Capsule()
          .fill(Color.accentColor)
          .frame(width: 4, height: 6 + CGFloat(level) * 22)
      }
    }
    .frame(height: 28)
    .animation(.linear(duration: 0.1), value: levels)
    .accessibilityHidden(true)
  }
}
