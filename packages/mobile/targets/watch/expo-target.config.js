/**
 * Apple Watch app (SwiftUI), embedded in the iPhone app by @bacons/apple-targets
 * at `expo prebuild`. It gets the session from the iPhone over WatchConnectivity
 * (modules/jarvi-watch) and talks to the same backend.
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = () => ({
  type: 'watch',
  name: 'JarviWatch',
  displayName: 'Jarvi',
  bundleIdentifier: '.watchkitapp',
  icon: '../../assets/images/icon.png',
  colors: {
    // Brand purple (same as the splash and the Android icon).
    $accent: '#6137F3',
  },
  // watchOS 10 runs on Apple Watch Series 4 and newer.
  deploymentTarget: '10.0',
});
