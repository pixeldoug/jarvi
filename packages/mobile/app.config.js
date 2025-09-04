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
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.jarvi.app',
      jsEngine: 'jsc',
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
      package: 'com.jarvi.app',
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
        process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api',
      appName: process.env.EXPO_PUBLIC_APP_NAME || 'Jarvi',
    },
    jsEngine: 'jsc',
    engine: 'jsc',
    runtimeVersion: '1.0.0',
    updates: {
      enabled: false,
    },
  },
};
