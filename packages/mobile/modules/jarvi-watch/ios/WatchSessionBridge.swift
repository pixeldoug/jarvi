import Foundation
import WatchConnectivity

/// Keeps the watch app signed in with the iPhone's session.
///
/// The session goes in the WatchConnectivity application context: the system
/// keeps only the latest one and hands it to the watch app the next time it
/// runs, even if the iPhone app is closed by then. The keys must match
/// `SessionStore` in targets/watch.
///
/// No Expo import here, so this file can be compiled on its own.
final class WatchSessionBridge: NSObject, WCSessionDelegate {
  static let shared = WatchSessionBridge()

  /// Keys of the application context (same names in targets/watch/SessionStore.swift).
  enum Key {
    static let token = "token"
    static let apiUrl = "apiUrl"
  }

  private let queue = DispatchQueue(label: "app.jarvi.watch-session")
  /// The last session JS asked for. Kept after sending, so a watch app
  /// installed later still gets it (`sessionWatchStateDidChange`).
  private var latest: [String: Any]?

  var isSupported: Bool { WCSession.isSupported() }

  func setSession(token: String?, apiUrl: String) {
    guard WCSession.isSupported() else { return }
    // An empty token is how the watch learns about a sign-out.
    let context: [String: Any] = [Key.token: token ?? "", Key.apiUrl: apiUrl]
    queue.async {
      self.latest = context
      let session = WCSession.default
      if session.activationState == .activated {
        self.send(on: session)
      } else {
        // The delegate must be set before activating.
        if session.delegate == nil { session.delegate = self }
        session.activate()
      }
    }
  }

  /// Runs on `queue`.
  private func send(on session: WCSession) {
    guard let context = latest,
          session.activationState == .activated,
          session.isPaired,
          session.isWatchAppInstalled
    else { return }
    do {
      try session.updateApplicationContext(context)
    } catch {
      NSLog("[JarviWatch] could not update the watch session: \(error.localizedDescription)")
    }
  }

  // MARK: WCSessionDelegate (called on a background queue)

  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    if let error { NSLog("[JarviWatch] activation failed: \(error.localizedDescription)") }
    queue.async { self.send(on: session) }
  }

  func sessionDidBecomeInactive(_ session: WCSession) {}

  /// The user switched to another watch: activate again for the new one.
  func sessionDidDeactivate(_ session: WCSession) {
    session.activate()
  }

  /// Pairing or the watch app's install state changed (e.g. the watch app was just installed).
  func sessionWatchStateDidChange(_ session: WCSession) {
    queue.async { self.send(on: session) }
  }
}
