import { useEffect } from 'react';

/**
 * Tracks the on-screen keyboard height using the VisualViewport API and exposes
 * it as the `--keyboard-offset` CSS variable on the document root.
 *
 * On iOS, `position: fixed; bottom` elements are anchored to the layout viewport,
 * which does not shrink when the virtual keyboard opens. This leaves a gap (the
 * page background) between a bottom-pinned element and the keyboard. Consuming
 * `--keyboard-offset` in the element's `bottom` lifts it above the keyboard.
 */
export function useKeyboardOffset(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const root = document.documentElement;

    const update = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty('--keyboard-offset', `${offset}px`);
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.style.removeProperty('--keyboard-offset');
    };
  }, []);
}
