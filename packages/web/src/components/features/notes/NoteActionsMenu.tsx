/**
 * NoteActionsMenu — "…" menu (ghost small icon-only DotsThreeVertical →
 * Dropdown of icon-less ListItems), per compliance.md.
 *
 * Clicks and Enter/Space are kept from bubbling (React bubbles through the
 * Dropdown portal), so the menu can live inside a clickable ListCard row.
 */

import { useCallback, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { DotsThreeVertical } from '@phosphor-icons/react';
import { Button, Dropdown, ListItem } from '../../ui';

export interface NoteActionsMenuItem {
  label: string;
  onSelect: () => void;
}

export interface NoteActionsMenuProps {
  items: NoteActionsMenuItem[];
  /** Dropdown vertical preference (the bottom of the page prefers 'auto') */
  position?: 'auto' | 'auto-top';
  /** Trigger look: ghost/small in rows, secondary/medium in the page top bar */
  triggerVariant?: 'ghost' | 'secondary';
  triggerSize?: 'small' | 'medium';
}

export function NoteActionsMenu({
  items,
  position = 'auto',
  triggerVariant = 'ghost',
  triggerSize = 'small',
}: NoteActionsMenuProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback(() => setIsOpen(false), []);

  const stopClick = (event: MouseEvent) => event.stopPropagation();
  const stopActivationKeys = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
  };

  return (
    <div ref={anchorRef} onClick={stopClick} onKeyDown={stopActivationKeys}>
      <Button
        variant={triggerVariant}
        size={triggerSize}
        icon={DotsThreeVertical}
        iconPosition="icon-only"
        aria-label="Mais opções"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        active={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      />
      <Dropdown
        isOpen={isOpen}
        onClose={close}
        anchorRef={anchorRef}
        align="right"
        position={position}
        width={200}
      >
        {items.map((item) => (
          <ListItem
            key={item.label}
            label={item.label}
            onClick={() => {
              setIsOpen(false);
              item.onSelect();
            }}
            buttonProps={{ role: 'menuitem' }}
          />
        ))}
      </Dropdown>
    </div>
  );
}
