/**
 * Preferred microphone for note recordings, persisted per browser.
 * '' means the system default device.
 */

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'jarvi_notes_mic_device';

function readStored(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

let current = typeof window === 'undefined' ? '' : readStored();
const listeners = new Set<() => void>();

export function getPreferredMicId(): string {
  return current;
}

export function setPreferredMicId(deviceId: string): void {
  current = deviceId;
  try {
    if (deviceId) window.localStorage.setItem(STORAGE_KEY, deviceId);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be unavailable (private mode); keep the in-memory choice.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePreferredMicId(): string {
  return useSyncExternalStore(subscribe, getPreferredMicId);
}
