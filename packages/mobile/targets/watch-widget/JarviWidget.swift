import SwiftUI
import WidgetKit

/// "Speak a task" from the watch face and the Smart Stack. It has no data of
/// its own (no shared storage with the app): it is a shortcut, so it never
/// shows a stale count. A tap opens the app listening.
@main
struct JarviWidgets: WidgetBundle {
  var body: some Widget {
    SpeakWidget()
  }
}

struct SpeakWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "JarviSpeak", provider: Provider()) { _ in
      SpeakWidgetView()
    }
    .configurationDisplayName("Falar tarefa")
    .description("Um toque e a Jarvi já está ouvindo.")
    .supportedFamilies([.accessoryCircular, .accessoryCorner, .accessoryRectangular, .accessoryInline])
  }
}

struct SpeakEntry: TimelineEntry {
  let date: Date
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> SpeakEntry { SpeakEntry(date: Date()) }

  func getSnapshot(in context: Context, completion: @escaping (SpeakEntry) -> Void) {
    completion(SpeakEntry(date: Date()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<SpeakEntry>) -> Void) {
    completion(Timeline(entries: [SpeakEntry(date: Date())], policy: .never))
  }
}

struct SpeakWidgetView: View {
  /// Same URL as VoiceLaunch.url in the watch app.
  private static let speakURL = URL(string: "jarviwatch://speak")!

  @Environment(\.widgetFamily) private var family

  var body: some View {
    content
      .widgetURL(Self.speakURL)
      .containerBackground(for: .widget) { Color.accentColor }
  }

  @ViewBuilder
  private var content: some View {
    switch family {
    case .accessoryCorner:
      Image(systemName: "mic.fill")
        .font(.title3)
        .widgetLabel("Jarvi")
    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 2) {
        Label("Jarvi", systemImage: "mic.fill")
          .font(.headline)
          .widgetAccentable()
        Text("Toque para falar")
          .font(.body)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    case .accessoryInline:
      Label("Falar tarefa", systemImage: "mic.fill")
    default:
      ZStack {
        AccessoryWidgetBackground()
        Image(systemName: "mic.fill")
          .font(.title2.weight(.semibold))
          .widgetAccentable()
      }
      .accessibilityLabel(Text("Falar tarefa"))
    }
  }
}
