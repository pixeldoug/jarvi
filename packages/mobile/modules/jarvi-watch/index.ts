import { requireOptionalNativeModule } from 'expo';

/**
 * Bridge to the Apple Watch app (targets/watch). iOS only; missing in Expo Go,
 * on Android and in tests, where every call is a no-op.
 */
interface JarviWatchNativeModule {
  isSupported(): boolean;
  setSession(token: string | null, apiUrl: string, locale: string): void;
}

const native = requireOptionalNativeModule<JarviWatchNativeModule>('JarviWatch');

/**
 * Hands the session to the watch; `null` signs the watch out. `locale` is the
 * app's language (`pt-BR` / `en-US`), the one the watch transcribes speech in.
 */
export function shareSessionWithWatch(token: string | null, apiUrl: string, locale: string): void {
  if (!native?.isSupported()) return;
  native.setSession(token, apiUrl, locale);
}
