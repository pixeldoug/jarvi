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
      // Use the layout viewport's clientHeight rather than window.innerHeight:
      // on iOS, innerHeight includes the area behind the browser's bottom
      // toolbar (overshooting the keyboard height); on Android with
      // interactive-widget=resizes-content, clientHeight shrinks with the
      // keyboard so the offset self-corrects to ~0 (no double counting).
      const layoutHeight = document.documentElement.clientHeight;
      const offset = Math.max(0, layoutHeight - vv.height - vv.offsetTop);
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
