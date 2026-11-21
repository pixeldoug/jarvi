import * as SecureStore from 'expo-secure-store';

/**
 * Small key-value store backed by the device keychain/keystore.
 * Used for the session token and a few preferences; values stay under 2 KB.
 * Storage failures never crash the app: reads fall back to null.
 */
export const storage = {
  async get(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },

  async set(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.warn(`storage.set(${key}) failed`, error);
    }
  },

  async remove(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Nothing stored under this key.
    }
  },
};

export const STORAGE_KEYS = {
  token: 'jarvi_token',
  appearance: 'jarvi_appearance',
} as const;
