import SwiftUI

@main
struct JarviWatchApp: App {
  @StateObject private var session = SessionStore.shared

  init() {
    SessionStore.shared.activate()
  }

  var body: some Scene {
    WindowGroup {
      TodayView()
        .environmentObject(session)
    }
  }
}
