import Foundation

/// The language the watch shows: the iPhone app's (pt-BR / en-US, sent with
/// the session), not the watch's own system language. Before the iPhone has
/// sent it, the watch's language.
///
/// SwiftUI text follows `RootView`'s `.environment(\.locale, …)` at once;
/// `AppleLanguages` makes the system pieces (alerts, buttons it draws) follow
/// it from the next launch; `string(_:)` is for text built outside SwiftUI.
enum AppLanguage {
  private static let defaultsKey = "jarvi.locale"

  /// `pt-BR` or `en-US`.
  static var identifier: String {
    if let saved = UserDefaults.standard.string(forKey: defaultsKey), saved == "pt-BR" || saved == "en-US" {
      return saved
    }
    return Bundle.main.preferredLocalizations.first == "en" ? "en-US" : "pt-BR"
  }

  static var locale: Locale { Locale(identifier: identifier) }

  /// The .lproj folder of this language (`pt` / `en`).
  private static var bundle: Bundle {
    let folder = identifier == "en-US" ? "en" : "pt"
    guard let path = Bundle.main.path(forResource: folder, ofType: "lproj"),
          let bundle = Bundle(path: path)
    else { return .main }
    return bundle
  }

  /// A Localizable.strings entry in this language (keys are the Portuguese text).
  static func string(_ key: String) -> String {
    bundle.localizedString(forKey: key, value: key, table: nil)
  }

  /// Called with the language the iPhone sent.
  static func set(_ identifier: String) {
    guard identifier == "pt-BR" || identifier == "en-US" else { return }
    UserDefaults.standard.set(identifier, forKey: defaultsKey)
    UserDefaults.standard.set([identifier], forKey: "AppleLanguages")
  }
}
