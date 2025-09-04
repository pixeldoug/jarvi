export default {
  expo: {
    name: 'Jarvi',
    slug: 'jarvi',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: false,
    scheme: 'jarvi',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#6366f1',
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.jarvi.app',
      buildNumber: '1.0.0',
      jsEngine: 'jsc',
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#6366f1',
      },
      edgeToEdgeEnabled: true,
      package: 'com.jarvi.app',
      versionCode: 1,
      jsEngine: 'jsc',
    },
    web: {
      favicon: './assets/favicon.png',
      jsEngine: 'jsc',
    },
    extra: {
      googleClientId:
        process.env.GOOGLE_CLIENT_ID || 'your-google-ios-client-id-here',
      apiBaseUrl:
        process.env.EXPO_PUBLIC_API_URL || 'https://jarvi-production.up.railway.app/api',
      appName: process.env.EXPO_PUBLIC_APP_NAME || 'Jarvi',
      eas: {
        projectId: 'd1f44a58-21da-4464-a9cf-85cd057de94c'
      }
    },
    jsEngine: 'jsc',
    engine: 'jsc',
    runtimeVersion: '1.0.0',
    updates: {
      enabled: false,
    },
  },
};
