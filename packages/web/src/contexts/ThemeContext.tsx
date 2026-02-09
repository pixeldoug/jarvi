/**
 * ThemeContext - Theme Provider and useTheme Hook
 * 
 * Provides theme switching functionality for the web application
 * Manages dark/light mode and persists preference to localStorage
 */

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'jarvi-theme-mode';

interface ThemeContextType {
  /** User preference (persisted) */
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  /** Temporary override (not persisted) */
  forcedTheme: ThemeMode | null;
  setForcedTheme: (theme: ThemeMode | null) => void;
  isDark: boolean;
  isLight: boolean;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    // Check localStorage for saved preference
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
    
    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    
    return 'light';
  });

  const [forcedTheme, setForcedTheme] = useState<ThemeMode | null>(null);

  const appliedTheme = forcedTheme ?? theme;

  useIsomorphicLayoutEffect(() => {
    // Apply theme class to html element (supports temporary overrides)
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(appliedTheme);
  }, [appliedTheme]);

  useEffect(() => {
    // Persist only the user's preference (never persist forced overrides)
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => {
    setThemeState(prev => prev === 'light' ? 'dark' : 'light');
  };

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
  };

  const value: ThemeContextType = useMemo(() => ({
    theme,
    setTheme,
    toggleTheme,
    forcedTheme,
    setForcedTheme,
    isDark: appliedTheme === 'dark',
    isLight: appliedTheme === 'light',
  }), [theme, forcedTheme, appliedTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
