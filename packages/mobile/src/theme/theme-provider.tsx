import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { Appearance, useColorScheme } from 'react-native';

import { STORAGE_KEYS, storage } from '@/lib/storage';
import { colorSchemes, type ColorSchemeName, type ThemeColors } from './tokens';

export type AppearancePreference = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  scheme: ColorSchemeName;
  colors: ThemeColors;
  preference: AppearancePreference;
  setPreference: (preference: AppearancePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isPreference(value: string | null): value is AppearancePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<AppearancePreference>('system');

  useEffect(() => {
    void storage.get(STORAGE_KEYS.appearance).then((stored) => {
      if (isPreference(stored)) setPreferenceState(stored);
    });
  }, []);

  useEffect(() => {
    // Native surfaces (date pickers, alerts, tab bar) follow this override too.
    Appearance.setColorScheme(preference === 'system' ? 'auto' : preference);
  }, [preference]);

  const setPreference = (next: AppearancePreference) => {
    setPreferenceState(next);
    void storage.set(STORAGE_KEYS.appearance, next);
  };

  const scheme: ColorSchemeName =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  return (
    <ThemeContext value={{ scheme, colors: colorSchemes[scheme], preference, setPreference }}>
      {children}
    </ThemeContext>
  );
}

export function useTheme(): ThemeContextValue {
  const context = use(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
