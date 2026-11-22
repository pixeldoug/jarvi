import ExpoModulesCore

/// JS entry point (modules/jarvi-watch/index.ts). The work is in WatchSessionBridge.
public class JarviWatchModule: Module {
  public func definition() -> ModuleDefinition {
    Name("JarviWatch")

    /// True on an iPhone that can pair with an Apple Watch.
    Function("isSupported") { () -> Bool in
      WatchSessionBridge.shared.isSupported
    }

    /// `token` nil means signed out: the watch forgets its session.
    Function("setSession") { (token: String?, apiUrl: String) in
      WatchSessionBridge.shared.setSession(token: token, apiUrl: apiUrl)
    }
  }
}
