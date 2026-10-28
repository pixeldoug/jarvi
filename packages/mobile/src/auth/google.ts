import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * Native Google Sign-In. The module ships native code, so it only exists in
 * development and store builds; Expo Go hides the button instead of crashing.
 *
 * The backend accepts ID tokens for the web client (Android, via
 * `webClientId`) and for the iOS client (`GOOGLE_MOBILE_CLIENT_ID`).
 */
export const isGoogleSignInAvailable = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

type GoogleModule = typeof import('@react-native-google-signin/google-signin');

let modulePromise: Promise<GoogleModule> | null = null;

function loadGoogle(): Promise<GoogleModule> {
  modulePromise ??= import('@react-native-google-signin/google-signin').then((mod) => {
    mod.GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    });
    return mod;
  });
  return modulePromise;
}

/** Returns a Google ID token, or null when the person cancels. */
export async function getGoogleIdToken(): Promise<string | null> {
  if (!isGoogleSignInAvailable) throw new Error('Entrar com Google não está disponível nesta versão do app.');
  const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } = await loadGoogle();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return null;
    if (!response.data.idToken) throw new Error('O Google não devolveu um token. Tente de novo.');
    return response.data.idToken;
  } catch (error) {
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED || error.code === statusCodes.IN_PROGRESS) return null;
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Atualize o Google Play Services para entrar com Google.');
      }
    }
    throw error;
  }
}

/** Forgets the Google account so the next sign-in shows the account picker. */
export async function signOutOfGoogle(): Promise<void> {
  if (!isGoogleSignInAvailable || !modulePromise) return;
  try {
    const { GoogleSignin } = await modulePromise;
    await GoogleSignin.signOut();
  } catch {
    // Not signed in with Google.
  }
}
