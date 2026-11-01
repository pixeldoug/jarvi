/**
 * Marks a scroll container with `data-fade-top` / `data-fade-bottom` while
 * there is hidden content above / below, so CSS can fade only the edges that
 * actually cut text (nothing is faded at rest at the top, or at the end).
 *
 * Writes the attributes straight to the element — no React state, so
 * scrolling never re-renders the editor.
 */

import { useEffect, type RefObject } from 'react';

/** Pixels of slack so sub-pixel scroll positions still count as "at the edge" */
const EDGE_EPSILON = 1;

export function useScrollFade(ref: RefObject<HTMLElement>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const hasAbove = el.scrollTop > EDGE_EPSILON;
      const hasBelow = el.scrollTop + el.clientHeight < el.scrollHeight - EDGE_EPSILON;
      el.toggleAttribute('data-fade-top', hasAbove);
      el.toggleAttribute('data-fade-bottom', hasBelow);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    el.addEventListener('scroll', schedule, { passive: true });
    // Content grows while typing, tabs swap, transcript segments arrive…
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(el);
    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(el, { childList: true, subtree: true, characterData: true });

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      el.removeEventListener('scroll', schedule);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [ref]);
}
