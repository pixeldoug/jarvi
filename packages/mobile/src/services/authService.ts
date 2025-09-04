import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { api } from './api';

// Configure WebBrowser for auth
WebBrowser.maybeCompleteAuthSession();

// Google OAuth configuration
const GOOGLE_CLIENT_ID =
  Constants.expoConfig?.extra?.googleClientId ||
  'your-google-ios-client-id-here';

// iOS URL scheme from Google Cloud Console
const GOOGLE_REDIRECT_URI = 'com.googleusercontent.apps.933867383204-gc7lts7bcc9to2k1puqumheetic5tbai:/oauth2redirect';

// Debug: Log the Google Client ID
console.log('🔍 Debug - Google Client ID:', GOOGLE_CLIENT_ID);
console.log('🔍 Debug - Redirect URI:', GOOGLE_REDIRECT_URI);
console.log('🔍 Debug - Constants.expoConfig?.extra:', Constants.expoConfig?.extra);

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export const authService = {
  // Google OAuth configuration
  discovery: {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
  },

  // Sign in with Google
  signInWithGoogle: async (): Promise<AuthResponse> => {
    try {
      console.log('🔍 Debug - Starting Google OAuth flow...');
      console.log('🔍 Debug - Using Client ID:', GOOGLE_CLIENT_ID);
      console.log('🔍 Debug - Using Redirect URI:', GOOGLE_REDIRECT_URI);
      
      // Create a new request for each authentication attempt
      const request = new AuthSession.AuthRequest({
        clientId: GOOGLE_CLIENT_ID,
        scopes: ['openid', 'profile', 'email'],
        redirectUri: GOOGLE_REDIRECT_URI,
        responseType: AuthSession.ResponseType.Code, // Changed from IdToken to Code
        usePKCE: true, // Enable PKCE for better security
      });

      // Start the OAuth flow
      const result = await request.promptAsync(authService.discovery);

      console.log('🔍 Debug - OAuth result:', result);

      if (result.type === 'success' && result.params.code) {
        console.log('🔍 Debug - OAuth successful, got authorization code');
        
        // Exchange the authorization code for tokens
        const tokenResult = await AuthSession.exchangeCodeAsync(
          {
            clientId: GOOGLE_CLIENT_ID,
            code: result.params.code,
            redirectUri: GOOGLE_REDIRECT_URI,
            extraParams: {
              code_verifier: request.codeVerifier,
            },
          },
          authService.discovery
        );

        console.log('🔍 Debug - Token exchange result:', tokenResult);

        if (tokenResult.idToken) {
          console.log('🔍 Debug - Got ID token, sending to backend...');
          
          // Send the ID token to our backend
          const response = await api.post('/auth/google', {
            idToken: tokenResult.idToken,
          });

          const authData: AuthResponse = response.data;

          // Store the token
          await AsyncStorage.setItem('authToken', authData.token);
          await AsyncStorage.setItem('userData', JSON.stringify(authData.user));

          // Update API headers
          api.defaults.headers.common['Authorization'] =
            `Bearer ${authData.token}`;

          return authData;
        } else {
          throw new Error('No ID token received from Google');
        }
      } else {
        console.log('🔍 Debug - OAuth failed or cancelled:', result);
        throw new Error('Authentication was cancelled or failed');
      }
    } catch (error) {
      console.error('🔍 Debug - Google sign-in error:', error);
      throw error;
    }
  },

  // Sign out
  signOut: async (): Promise<void> => {
    try {
      await AsyncStorage.removeItem('authToken');
      await AsyncStorage.removeItem('userData');
      delete api.defaults.headers.common['Authorization'];
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  },

  // Get stored token
  getToken: async (): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem('authToken');
    } catch (error) {
      console.error('Get token error:', error);
      return null;
    }
  },

  // Get stored user data
  getUser: async (): Promise<User | null> => {
    try {
      const userData = await AsyncStorage.getItem('userData');
      return userData ? JSON.parse(userData) : null;
    } catch (error) {
      console.error('Get user error:', error);
      return null;
    }
  },

  // Check if user is authenticated
  isAuthenticated: async (): Promise<boolean> => {
    try {
      const token = await authService.getToken();
      return !!token;
    } catch (error) {
      return false;
    }
  },

  // Initialize auth state (call this on app start)
  initializeAuth: async (): Promise<void> => {
    try {
      const token = await authService.getToken();
      if (token) {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Initialize auth error:', error);
    }
  },
};
