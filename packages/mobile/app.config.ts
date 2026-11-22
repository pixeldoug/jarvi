import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * One config for every build. EAS profiles (eas.json) set APP_ENV and the
 * EXPO_PUBLIC_* values; local `expo start` falls back to the local backend.
 */
const GOOGLE_IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ??
  '933867383204-gc7lts7bcc9to2k1puqumheetic5tbai.apps.googleusercontent.com';

/** Google expects the reversed iOS client id as a URL scheme. */
const googleIosUrlScheme = `com.googleusercontent.apps.${GOOGLE_IOS_CLIENT_ID.replace(
  '.apps.googleusercontent.com',
  '',
)}`;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Jarvi',
  slug: 'jarvi',
  version: '1.0.0',
  orientation: 'portrait',
  platforms: ['ios', 'android'],
  icon: './assets/images/icon.png',
  scheme: 'jarvi',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.jarvi.app',
    // Apple Developer team; @bacons/apple-targets signs the watch app (targets/watch) with it.
    appleTeamId: 'Y4382T9AG4',
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      // pt-BR is the default language (docs/decisions/0005-i18n.md): a device in
      // an unsupported language gets the Portuguese system strings, like the JS UI.
      CFBundleDevelopmentRegion: 'pt',
    },
  },
  // Native strings per language (iOS InfoPlist.strings). Keep the pt text equal
  // to `microphonePermission` below, which is the base value.
  locales: {
    pt: './src/locales/native/pt.json',
    en: './src/locales/native/en.json',
  },
  android: {
    package: 'com.jarvi.app',
    adaptiveIcon: {
      backgroundColor: '#6137F3',
      foregroundImage: './assets/images/android-icon-foreground.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-localization',
      {
        // Languages the app speaks (iOS CFBundleLocalizations, Android per-app
        // language list). Must match SUPPORTED_LOCALES in src/i18n/locale.ts.
        supportedLocales: { ios: ['pt', 'en'], android: ['pt-BR', 'en-US'] },
      },
    ],
    '@react-native-community/datetimepicker',
    [
      'expo-audio',
      {
        microphonePermission: 'A Jarvi usa o microfone para transcrever o que você grava nas suas notas.',
        // A meeting keeps recording with the screen locked.
        enableBackgroundRecording: true,
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#6137F3',
        image: './assets/images/splash-icon.png',
        imageWidth: 88,
      },
    ],
    ['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }],
    // Native targets in ./targets (the Apple Watch app), added to the Xcode project at prebuild.
    '@bacons/apple-targets',
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: {
      projectId: 'd1f44a58-21da-4464-a9cf-85cd057de94c',
    },
  },
});
