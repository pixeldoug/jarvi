/**
 * NoteCopyMenu — the top bar's copy button (secondary medium icon-only Copy)
 * → Dropdown with one ListItem per tab (the tab's icon): copies that tab's
 * text. Tabs with nothing to copy are disabled.
 */

import { useCallback, useRef, useState } from 'react';
import { Copy } from '@phosphor-icons/react';
import { Button, Dropdown, ListItem, Tooltip } from '../../ui';
import { NOTE_TABS, type NoteTab } from './noteTabConfig';

const COPY_LABELS: Record<NoteTab, string> = {
  resumo: 'Copiar resumo',
  notas: 'Copiar notas',
  transcricao: 'Copiar transcrição',
};

export interface NoteCopyMenuProps {
  /** Read when the menu opens */
  canCopy: (tab: NoteTab) => boolean;
  onCopy: (tab: NoteTab) => void;
}

export function NoteCopyMenu({ canCopy, onCopy }: NoteCopyMenuProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <div ref={anchorRef}>
      {/* No tooltip over the open menu */}
      <Tooltip label="Copiar" position="bottom" disabled={isOpen}>
        <Button
          variant="secondary"
          size="medium"
          icon={Copy}
          iconPosition="icon-only"
          aria-label="Copiar"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          active={isOpen}
          onClick={() => setIsOpen((open) => !open)}
        />
      </Tooltip>
      <Dropdown isOpen={isOpen} onClose={close} anchorRef={anchorRef} align="right" width={220}>
        {NOTE_TABS.map((tab) => (
          <ListItem
            key={tab.id}
            label={COPY_LABELS[tab.id]}
            icon={tab.icon}
            disabled={!canCopy(tab.id)}
            onClick={() => {
              setIsOpen(false);
              onCopy(tab.id);
            }}
            buttonProps={{ role: 'menuitem' }}
          />
        ))}
      </Dropdown>
    </div>
  );
}
