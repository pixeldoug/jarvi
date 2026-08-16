'use client';

import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & {
      queue?: unknown[];
      loaded?: boolean;
      version?: string;
    };
    _fbq?: Window['fbq'];
  }
}

/**
 * SPA PageView tracker for the marketing site.
 *
 * The Pixel base code, `_fbc`/`_fbp` cookies (Domain=.jarvi.life), and the
 * first PageView are injected in the root layout before hydration. This
 * provider only fires extra PageViews on client-side route changes.
 */

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

function MetaPixelPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const skippedInitial = useRef(false);

  useEffect(() => {
    if (!PIXEL_ID || typeof window === 'undefined' || !window.fbq) return;
    if (!skippedInitial.current) {
      skippedInitial.current = true;
      return;
    }
    window.fbq('track', 'PageView');
  }, [pathname, searchParams]);

  return null;
}

export function MetaPixelProvider({ children }: { children: React.ReactNode }) {
  if (!PIXEL_ID) {
    return <>{children}</>;
  }

  return (
    <>
      <Suspense fallback={null}>
        <MetaPixelPageView />
      </Suspense>
      {children}
    </>
  );
}
