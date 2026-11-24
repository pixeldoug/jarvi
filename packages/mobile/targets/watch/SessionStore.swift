import Foundation
import Security
import WatchConnectivity

/// The session the iPhone app hands over (modules/jarvi-watch/ios/WatchSessionBridge.swift).
///
/// It arrives as the WatchConnectivity application context and is kept on the
/// watch (token in the Keychain), so the app works without the iPhone nearby.
final class SessionStore: NSObject, ObservableObject, WCSessionDelegate {
  static let shared = SessionStore()

  /// Keys of the application context (same names as WatchSessionBridge.Key).
  private enum Key {
    static let token = "token"
    static let apiUrl = "apiUrl"
    static let locale = "locale"
  }

  private static let apiUrlDefaultsKey = "jarvi.apiUrl"
  private static let localeDefaultsKey = "jarvi.locale"

  @Published private(set) var token: String?
  @Published private(set) var apiURL: URL?
  /// The iPhone app's language (`pt-BR` / `en-US`): speech is transcribed in
  /// it, whatever language the watch itself is set to. Nil until an iPhone
  /// app that sends it has run.
  @Published private(set) var locale: String?

  var isSignedIn: Bool { token != nil && apiURL != nil }

  override init() {
    token = Keychain.read()
    apiURL = UserDefaults.standard.string(forKey: Self.apiUrlDefaultsKey).flatMap(URL.init(string:))
    locale = UserDefaults.standard.string(forKey: Self.localeDefaultsKey)
    super.init()
  }

  /// Call once at launch.
  func activate() {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    session.delegate = self
    session.activate()
  }

  private func apply(_ context: [String: Any]) {
    guard let apiUrl = context[Key.apiUrl] as? String, let url = URL(string: apiUrl) else { return }
    let newToken = (context[Key.token] as? String).flatMap { $0.isEmpty ? nil : $0 }
    let newLocale = (context[Key.locale] as? String).flatMap { $0.isEmpty ? nil : $0 }
    DispatchQueue.main.async {
      if let newLocale, newLocale != self.locale {
        UserDefaults.standard.set(newLocale, forKey: Self.localeDefaultsKey)
        self.locale = newLocale
      }
      if newToken != self.token {
        if let newToken { Keychain.save(newToken) } else { Keychain.delete() }
        self.token = newToken
      }
      if url != self.apiURL {
        UserDefaults.standard.set(apiUrl, forKey: Self.apiUrlDefaultsKey)
        self.apiURL = url
      }
    }
  }

  // MARK: WCSessionDelegate (called on a background queue)

  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    // The context the iPhone sent while this app was not running.
    let context = session.receivedApplicationContext
    if !context.isEmpty { apply(context) }
  }

  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    apply(applicationContext)
  }
}

/// The token, in the watch's Keychain (readable after the first unlock, never synced).
private enum Keychain {
  private static let service = "app.jarvi.watch"
  private static let account = "session"

  private static var query: [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
  }

  static func read() -> String? {
    var request = query
    request[kSecReturnData as String] = true
    request[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: AnyObject?
    guard SecItemCopyMatching(request as CFDictionary, &result) == errSecSuccess,
          let data = result as? Data
    else { return nil }
    return String(data: data, encoding: .utf8)
  }

  static func save(_ token: String) {
    delete()
    var item = query
    item[kSecValueData as String] = Data(token.utf8)
    item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    SecItemAdd(item as CFDictionary, nil)
  }

  static func delete() {
    SecItemDelete(query as CFDictionary)
  }
}
