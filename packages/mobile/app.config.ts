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
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
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
    '@react-native-community/datetimepicker',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#6137F3',
        image: './assets/images/splash-icon.png',
        imageWidth: 88,
      },
    ],
    ['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }],
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
