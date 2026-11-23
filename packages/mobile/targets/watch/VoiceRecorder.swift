import AVFoundation

/// Records what the user says for a new task: small AAC file (mono, 16 kHz),
/// live levels for the waveform, and an automatic stop once they go quiet.
@MainActor
final class VoiceRecorder: NSObject, ObservableObject {
  enum StartError: Error {
    case microphoneDenied
    case failed
  }

  /// How a recording ended.
  enum Outcome {
    /// A file to send (`heardSpeech` false: it never got louder than silence).
    case recorded(URL, heardSpeech: Bool)
    case failed
  }

  /// "m4a" in the type is what makes the server name the file .m4a; OpenAI
  /// rejects this AAC file when it is named .mp4 ("audio/mp4").
  static let mimeType = "audio/x-m4a"
  /// A task is a sentence; this also keeps the upload small.
  static let maxDuration: TimeInterval = 60

  /// Louder than this (dBFS) counts as speech.
  private static let speechLevel: Float = -38
  /// After speech, this long under `speechLevel` ends the recording.
  private static let pauseToStop: TimeInterval = 1.6
  /// With no speech at all, give up after this long.
  private static let waitForSpeech: TimeInterval = 7

  /// Recent levels, 0…1, newest last (the waveform).
  @Published private(set) var levels: [Float] = Array(repeating: 0, count: 12)
  @Published private(set) var elapsed: TimeInterval = 0

  private var recorder: AVAudioRecorder?
  private var meterTask: Task<Void, Never>?
  private var heardSpeech = false
  private var quietSince: Date?
  private var startedAt = Date()
  private var cancelled = false
  private var continuation: CheckedContinuation<Outcome, Never>?

  var isRecording: Bool { recorder?.isRecording == true }

  /// Starts recording and returns when it ends: the user stops it, they pause
  /// after speaking, or it reaches `maxDuration`. Returns nil if cancelled.
  func record() async throws -> Outcome? {
    guard await AVAudioApplication.requestRecordPermission() else { throw StartError.microphoneDenied }

    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.record, mode: .default)
      try session.setActive(true)
    } catch {
      throw StartError.failed
    }

    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString)
      .appendingPathExtension("m4a")
    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVSampleRateKey: 16_000,
      AVNumberOfChannelsKey: 1,
      AVEncoderBitRateKey: 32_000,
    ]
    guard let recorder = try? AVAudioRecorder(url: url, settings: settings) else { throw StartError.failed }
    recorder.delegate = self
    recorder.isMeteringEnabled = true

    heardSpeech = false
    quietSince = nil
    cancelled = false
    elapsed = 0
    levels = Array(repeating: 0, count: levels.count)
    startedAt = Date()
    guard recorder.record(forDuration: Self.maxDuration) else { throw StartError.failed }
    self.recorder = recorder
    startMetering()

    let outcome = await withCheckedContinuation { self.continuation = $0 }
    return cancelled ? nil : outcome
  }

  /// Ends the recording and sends it.
  func stop() {
    recorder?.stop()
  }

  /// Ends the recording and throws it away.
  func cancel() {
    guard let recorder else { return }
    cancelled = true
    recorder.stop()
  }

  private func startMetering() {
    meterTask?.cancel()
    meterTask = Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: .milliseconds(100))
        self?.tick()
      }
    }
  }

  private func tick() {
    guard let recorder, recorder.isRecording else { return }
    recorder.updateMeters()
    let power = recorder.averagePower(forChannel: 0)
    // -60 dB (quiet room) → 0, -10 dB (close, loud voice) → 1.
    let level = min(max((power + 60) / 50, 0), 1)
    levels = Array(levels.dropFirst()) + [level]

    let now = Date()
    elapsed = now.timeIntervalSince(startedAt)
    if power > Self.speechLevel {
      heardSpeech = true
      quietSince = nil
    } else if heardSpeech {
      let since = quietSince ?? now
      quietSince = since
      if now.timeIntervalSince(since) >= Self.pauseToStop { recorder.stop() }
    } else if elapsed >= Self.waitForSpeech {
      recorder.stop()
    }
  }

  private func finish(_ recorder: AVAudioRecorder, successfully: Bool) {
    guard recorder === self.recorder else { return }
    meterTask?.cancel()
    meterTask = nil
    self.recorder = nil
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)

    let outcome: Outcome
    if cancelled || !successfully {
      try? FileManager.default.removeItem(at: recorder.url)
      outcome = .failed
    } else {
      outcome = .recorded(recorder.url, heardSpeech: heardSpeech)
    }
    continuation?.resume(returning: outcome)
    continuation = nil
  }
}

extension VoiceRecorder: AVAudioRecorderDelegate {
  nonisolated func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
    Task { @MainActor in self.finish(recorder, successfully: flag) }
  }

  nonisolated func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
    Task { @MainActor in self.finish(recorder, successfully: false) }
  }
}
