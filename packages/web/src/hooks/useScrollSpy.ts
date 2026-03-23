/**
 * useScrollSpy
 *
 * Observes a list of section elements and returns the ID of the one currently
 * most visible near the top of the viewport. Uses IntersectionObserver with a
 * short debounce to avoid flicker on fast scrolls.
 *
 * The active section is the first (in DOM/array order) that is intersecting
 * according to the configured rootMargin. This reliably tracks the topmost
 * visible section as the user scrolls down.
 */

import { useState, useEffect, useRef } from 'react';

interface UseScrollSpyOptions {
  /** Ordered list of element IDs to observe (same order as in the DOM). */
  sectionIds: string[];
  /**
   * Whether the spy is active. Pass `false` to skip all observation (e.g.
   * when a filtered single-section view is rendered instead of the all-view).
   */
  enabled?: boolean;
  /**
   * IntersectionObserver rootMargin.
   * Default trims 60 % from the bottom so a section activates when its top
   * enters the upper 40 % of the viewport.
   */
  rootMargin?: string;
  /** Debounce delay in ms (default 60). */
  debounceMs?: number;
}

export function useScrollSpy({
  sectionIds,
  enabled = true,
  rootMargin = '0px 0px -60% 0px',
  debounceMs = 60,
}: UseScrollSpyOptions): string | null {
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  // Mutable set of currently intersecting IDs — kept outside state to avoid
  // stale-closure issues inside the observer callback.
  const intersectingRef = useRef(new Set<string>());
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || sectionIds.length === 0) {
      setActiveSectionId(null);
      return;
    }

    const intersecting = intersectingRef.current;
    intersecting.clear();

    const flush = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        // Pick the first sectionId (in provided order) that is intersecting.
        // This gives us the topmost visible section when the order matches DOM order.
        const active = sectionIds.find((id) => intersecting.has(id)) ?? null;
        setActiveSectionId(active);
      }, debounceMs);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            intersecting.add(entry.target.id);
          } else {
            intersecting.delete(entry.target.id);
          }
        });
        flush();
      },
      { rootMargin, threshold: 0.05 },
    );

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => {
      observer.disconnect();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      intersecting.clear();
    };
    // Re-run when the set of IDs or enabled flag changes.
    // rootMargin and debounceMs are treated as stable after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(sectionIds), enabled]);

  return activeSectionId;
}
