import AppIntents

/// "Nova tarefa no Jarvi": opens the watch app already listening. Siri runs
/// it by voice, and the Apple Watch Ultra's Action button can run it through
/// a shortcut.
struct SpeakTaskIntent: AppIntent {
  static var title: LocalizedStringResource = "Nova tarefa por voz"
  static var description = IntentDescription("Abre a Jarvi já ouvindo.")
  static var openAppWhenRun = true

  @MainActor
  func perform() async throws -> some IntentResult {
    VoiceLaunch.shared.requested = true
    return .result()
  }
}

struct JarviShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: SpeakTaskIntent(),
      phrases: [
        "Nova tarefa no \(.applicationName)",
        "Adicionar tarefa no \(.applicationName)",
        "Falar tarefa no \(.applicationName)",
      ],
      shortTitle: "Nova tarefa",
      systemImageName: "mic.fill"
    )
  }
}
