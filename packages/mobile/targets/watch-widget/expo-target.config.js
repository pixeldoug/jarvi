/**
 * Watch face complication and Smart Stack widget (WidgetKit), embedded in the
 * watch app (targets/watch) by @bacons/apple-targets. A tap opens the watch
 * app already listening (jarviwatch://speak), the app's main action.
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = () => ({
  type: 'watch-widget',
  name: 'JarviWatchWidget',
  displayName: 'Jarvi',
  // Must sit under the watch app's id (com.jarvi.app.watchkitapp).
  bundleIdentifier: '.watchkitapp.widget',
  colors: {
    $accent: '#6137F3',
    $widgetBackground: '#6137F3',
  },
  deploymentTarget: '10.0',
});
