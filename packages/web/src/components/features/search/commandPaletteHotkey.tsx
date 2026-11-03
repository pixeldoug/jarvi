/**
 * ⌘K / Ctrl+K for the CommandPalette, and its key cap for the Sidebar item.
 */

import { useEffect } from 'react';
import { isMac } from '../../../lib/utils';
import styles from './CommandPalette.module.css';

export const COMMAND_PALETTE_SHORTCUT = isMac() ? '⌘K' : 'Ctrl K';

/**
 * Toggles the palette from anywhere, inputs and the note editor included.
 * While another modal is open it does nothing: the palette would stack a
 * second overlay on it (compliance: one overlay).
 */
export function useCommandPaletteHotkey(isOpen: boolean, onToggle: () => void): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== 'k' && event.code !== 'KeyK') return;
      if (!isOpen && document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      onToggle();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onToggle]);
}

export function CommandPaletteShortcut() {
  return <kbd className={styles.kbd}>{COMMAND_PALETTE_SHORTCUT}</kbd>;
}
