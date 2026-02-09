import { useContext, useEffect, useLayoutEffect, useRef } from 'react';
import { ThemeContext, type ThemeMode } from '../contexts/ThemeContext';

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Forces a theme on the document root while the component is mounted.
 * Restores the previous theme classes on unmount.
 *
 * Important: this intentionally DOES NOT touch ThemeContext state/localStorage.
 */
export function useForceTheme(forcedTheme: ThemeMode) {
  const themeCtx = useContext(ThemeContext);
  const previousForcedThemeRef = useRef<ThemeMode | null>(null);

  useIsomorphicLayoutEffect(() => {
    // Prefer ThemeContext override (prevents ThemeProvider from re-applying dark)
    if (themeCtx) {
      previousForcedThemeRef.current = themeCtx.forcedTheme ?? null;
      themeCtx.setForcedTheme(forcedTheme);

      return () => {
        themeCtx.setForcedTheme(previousForcedThemeRef.current);
      };
    }

    // Fallback: directly manipulate document root classes
    const root = document.documentElement;
    const prevTheme: ThemeMode | null =
      root.classList.contains('dark') ? 'dark' :
      root.classList.contains('light') ? 'light' :
      null;

    root.classList.remove('light', 'dark');
    root.classList.add(forcedTheme);

    return () => {
      root.classList.remove('light', 'dark');
      if (prevTheme) root.classList.add(prevTheme);
    };
  }, [forcedTheme]);
}

