import Foundation
import Network

/// Whether the watch has a network path (Wi-Fi, cellular or the iPhone), to
/// send recordings kept offline as soon as it comes back.
@MainActor
final class Connectivity: ObservableObject {
  @Published private(set) var isOnline = true

  private let monitor = NWPathMonitor()

  init() {
    monitor.pathUpdateHandler = { [weak self] path in
      let online = path.status == .satisfied
      Task { @MainActor in
        if self?.isOnline != online { self?.isOnline = online }
      }
    }
    monitor.start(queue: DispatchQueue(label: "app.jarvi.watch.connectivity"))
  }

  deinit {
    monitor.cancel()
  }
}
