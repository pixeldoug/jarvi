/**
 * BackgroundContext - Background Image Provider and useBackground Hook
 *
 * Manages the user's selected background image for the main app layout.
 * Persists preference to localStorage independently of theme.
 *
 * Figma: https://figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-App?node-id=40001338-217221
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  ReactNode,
} from 'react';

import bgWarmClouds from '../assets/backgrounds/bg-warm-clouds.png';
import bgCanyon from '../assets/backgrounds/bg-canyon.png';
import bgBlueClouds from '../assets/backgrounds/bg-blue-clouds.png';
import bgGreen from '../assets/backgrounds/bg-green.png';
import bgDarkClouds from '../assets/backgrounds/bg-dark-clouds.png';
import bgDark from '../assets/backgrounds/bg-dark.png';

// ============================================================================
// TYPES
// ============================================================================

export type BackgroundId =
  | 'bg-warm-clouds'
  | 'bg-canyon'
  | 'bg-blue-clouds'
  | 'bg-green'
  | 'bg-dark-clouds'
  | 'bg-dark';

export interface BackgroundOption {
  id: BackgroundId;
  /** Resolved image URL (undefined for the solid-dark option) */
  src: string | undefined;
}

export const BACKGROUND_OPTIONS: BackgroundOption[] = [
  { id: 'bg-warm-clouds', src: bgWarmClouds },
  { id: 'bg-canyon',      src: bgCanyon      },
  { id: 'bg-blue-clouds', src: bgBlueClouds  },
  { id: 'bg-green',       src: bgGreen       },
  { id: 'bg-dark-clouds', src: bgDarkClouds  },
  { id: 'bg-dark',        src: bgDark        },
];

const BACKGROUND_STORAGE_KEY = 'jarvi-background-id';
const DEFAULT_BACKGROUND: BackgroundId = 'bg-canyon';

interface BackgroundContextType {
  backgroundId: BackgroundId;
  setBackground: (id: BackgroundId) => void;
  /** Resolved image src for the current selection (undefined = solid dark) */
  backgroundSrc: string | undefined;
}

// ============================================================================
// CONTEXT
// ============================================================================

export const BackgroundContext = createContext<BackgroundContextType | undefined>(undefined);

// ============================================================================
// PROVIDER
// ============================================================================

export function BackgroundProvider({ children }: { children: ReactNode }) {
  const [backgroundId, setBackgroundId] = useState<BackgroundId>(() => {
    const saved = localStorage.getItem(BACKGROUND_STORAGE_KEY) as BackgroundId | null;
    const valid = BACKGROUND_OPTIONS.some((o) => o.id === saved);
    return valid && saved ? saved : DEFAULT_BACKGROUND;
  });

  useEffect(() => {
    localStorage.setItem(BACKGROUND_STORAGE_KEY, backgroundId);
  }, [backgroundId]);

  const backgroundSrc = useMemo(
    () => BACKGROUND_OPTIONS.find((o) => o.id === backgroundId)?.src,
    [backgroundId],
  );

  const value = useMemo<BackgroundContextType>(
    () => ({
      backgroundId,
      setBackground: setBackgroundId,
      backgroundSrc,
    }),
    [backgroundId, backgroundSrc],
  );

  return (
    <BackgroundContext.Provider value={value}>{children}</BackgroundContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

export function useBackground(): BackgroundContextType {
  const ctx = useContext(BackgroundContext);
  if (!ctx) {
    throw new Error('useBackground must be used within a BackgroundProvider');
  }
  return ctx;
}
