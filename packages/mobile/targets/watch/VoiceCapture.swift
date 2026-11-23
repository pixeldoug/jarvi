import Foundation
import WatchKit

/// The watch's main action: speak a task. Listening → sending → created (or
/// kept for later when there is no connection).
@MainActor
final class VoiceCapture: ObservableObject {
  enum Phase: Equatable {
    case idle
    case listening
    case sending
    case created(WatchTask, transcript: String?)
    /// Nothing was said (or only silence reached the server).
    case noSpeech
    /// No connection: the recording waits in the outbox.
    case saved
    case micDenied
    case failed(TaskAPIError)
  }

  @Published private(set) var phase: Phase = .idle
  @Published private(set) var undoing = false
  let recorder = VoiceRecorder()

  private let outbox = VoiceOutbox.shared
  private var stoppedByUser = false
  /// Bumped by each start/close: late results of an older capture are dropped.
  private var generation = 0

  var isPresented: Bool { phase != .idle }

  /// Starts listening right away (home button, list button, complication, Siri).
  func start(api: TaskAPI, onCreated: @escaping () -> Void) {
    guard phase == .idle || phase == .noSpeech || phase == .micDenied || isFailed else { return }
    generation += 1
    let current = generation
    stoppedByUser = false
    phase = .listening
    WKInterfaceDevice.current().play(.start)

    Task {
      let outcome: VoiceRecorder.Outcome?
      do {
        outcome = try await recorder.record()
      } catch VoiceRecorder.StartError.microphoneDenied {
        if current == generation { phase = .micDenied }
        return
      } catch {
        if current == generation { phase = .failed(.server) }
        return
      }
      guard current == generation, let outcome else { return }

      switch outcome {
      case .failed:
        phase = .failed(.server)
      case .recorded(let url, let heardSpeech):
        // Timed out without a sound: don't upload seven seconds of silence.
        if !heardSpeech && !stoppedByUser {
          try? FileManager.default.removeItem(at: url)
          phase = .noSpeech
          WKInterfaceDevice.current().play(.failure)
          return
        }
        WKInterfaceDevice.current().play(.stop)
        await send(url, api: api, generation: current, onCreated: onCreated)
      }
    }
  }

  /// The stop button: send what was said.
  func finishListening() {
    stoppedByUser = true
    recorder.stop()
  }

  /// Closes the capture (X, OK, or the created screen timing out).
  func close() {
    if phase == .listening { recorder.cancel() }
    generation += 1
    undoing = false
    phase = .idle
  }

  /// "Desfazer" on the created screen.
  func undo(api: TaskAPI, onUndone: @escaping () -> Void) {
    guard case .created(let task, _) = phase, !undoing else { return }
    undoing = true
    let current = generation
    Task {
      do {
        try await api.delete(id: task.id)
        guard current == generation else { return }
        WKInterfaceDevice.current().play(.click)
        close()
        onUndone()
      } catch {
        guard current == generation else { return }
        undoing = false
        phase = .failed(TaskAPIError(error))
      }
    }
  }

  private var isFailed: Bool {
    if case .failed = phase { return true }
    return false
  }

  private func send(_ url: URL, api: TaskAPI, generation current: Int, onCreated: @escaping () -> Void) async {
    let now = Date()
    let today = TodayTasks.dateKey(now)
    let time = Self.clock(now)
    // Into the outbox first, so a failed upload keeps it for later.
    guard let item = outbox.add(recording: url, id: UUID(), owner: api.accountID, today: today, now: time) else {
      phase = .failed(.server)
      return
    }
    phase = .sending
    do {
      let result = try await outbox.send(item, api: api)
      onCreated()
      guard current == generation else { return }
      phase = .created(result.task, transcript: result.transcript)
      WKInterfaceDevice.current().play(.success)
    } catch {
      guard current == generation else { return }
      switch TaskAPIError(error) {
      case .network:
        phase = .saved
      case .noSpeech:
        phase = .noSpeech
        WKInterfaceDevice.current().play(.failure)
      case let failure:
        // The recording stays in the outbox and is retried later.
        phase = failure == .server ? .saved : .failed(failure)
      }
    }
  }

  /// HH:mm in the watch's time zone, 24 h.
  private static func clock(_ date: Date) -> String {
    let parts = TodayTasks.keyCalendar.dateComponents([.hour, .minute], from: date)
    return String(format: "%02d:%02d", parts.hour ?? 0, parts.minute ?? 0)
  }
}

/// Opening the app on "speak" (complication, Smart Stack, Siri, Action button).
@MainActor
final class VoiceLaunch: ObservableObject {
  static let shared = VoiceLaunch()
  static let url = URL(string: "jarviwatch://speak")!

  /// Set when the app should start listening as soon as it is on screen.
  @Published var requested = false

  func handle(_ url: URL) {
    if url.scheme == Self.url.scheme && url.host == Self.url.host { requested = true }
  }
}
