/**
 * TaskPeekToolbar — the task details' window controls (Notion's peek bar):
 *  - always: Fechar (Esc) and Abrir em página inteira / no painel lateral
 *  - on hover over the details (or keyboard focus): the default way tasks open
 *    (Painel lateral / Página inteira) and Tarefa anterior / Próxima tarefa
 * A control without its handler isn't shown (e.g. the Chats page's panel only
 * closes).
 */

import { useRef, useState } from 'react';
import {
  ArrowsInSimple,
  ArrowsOutSimple,
  CaretDoubleRight,
  CaretDown,
  CaretUp,
  Check,
  Rectangle,
  SidebarSimple,
  type Icon,
} from '@phosphor-icons/react';
import { Button, Dropdown, ListItem, Tooltip } from '../../../ui';
import styles from './TaskPeekToolbar.module.css';

/** How a task opens from the list */
export type TaskPeekMode = 'side' | 'full';

const PEEK_MODES: Array<{ mode: TaskPeekMode; label: string; icon: Icon }> = [
  { mode: 'side', label: 'Painel lateral', icon: SidebarSimple },
  { mode: 'full', label: 'Página inteira', icon: Rectangle },
];

export interface TaskPeekToolbarProps {
  /** Where these details are shown now */
  variant: 'side' | 'full';
  onClose?: () => void;
  /** Side: open as a full page; full: back to the side panel */
  onToggleSize?: () => void;
  peekMode?: TaskPeekMode;
  onPeekModeChange?: (mode: TaskPeekMode) => void;
  /** Undefined: no task before / after (the arrow shows disabled) */
  onPrevious?: () => void;
  onNext?: () => void;
  /** Shows the arrows (pages that have an order to walk through) */
  showNavigation?: boolean;
}

function ToolbarButton({
  icon,
  label,
  onClick,
  disabled,
  mirrored,
}: {
  icon: Icon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  mirrored?: boolean;
}) {
  return (
    <Tooltip label={label} position="bottom" showDelay={300} disabled={disabled}>
      <Button
        variant="ghost"
        size="small"
        icon={icon}
        iconPosition="icon-only"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className={mirrored ? styles.mirrored : undefined}
      />
    </Tooltip>
  );
}

export function TaskPeekToolbar({
  variant,
  onClose,
  onToggleSize,
  peekMode = 'side',
  onPeekModeChange,
  onPrevious,
  onNext,
  showNavigation = false,
}: TaskPeekToolbarProps) {
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const modeButtonRef = useRef<HTMLSpanElement>(null);
  const current = PEEK_MODES.find((option) => option.mode === peekMode) ?? PEEK_MODES[0];
  const hasExtras = Boolean(onPeekModeChange) || showNavigation;

  return (
    <div className={styles.toolbar}>
      {onClose && <ToolbarButton icon={CaretDoubleRight} label="Fechar (Esc)" onClick={onClose} />}
      {onToggleSize && (
        <ToolbarButton
          icon={variant === 'side' ? ArrowsOutSimple : ArrowsInSimple}
          label={variant === 'side' ? 'Abrir em página inteira' : 'Abrir no painel lateral'}
          onClick={onToggleSize}
        />
      )}

      {hasExtras && (
        <div className={styles.extras} data-open={isModeMenuOpen || undefined}>
          {onPeekModeChange && (
            <>
              <span className={styles.divider} aria-hidden="true" />
              <span ref={modeButtonRef} className={styles.anchor}>
                <Tooltip
                  label="Abrir tarefas em…"
                  position="bottom"
                  showDelay={300}
                  disabled={isModeMenuOpen}
                >
                  <Button
                    variant="ghost"
                    size="small"
                    icon={current.icon}
                    iconPosition="icon-only"
                    active={isModeMenuOpen}
                    aria-label={`Abrir tarefas em: ${current.label}`}
                    aria-haspopup="menu"
                    aria-expanded={isModeMenuOpen}
                    onClick={() => setIsModeMenuOpen((open) => !open)}
                    className={current.mode === 'side' ? styles.mirrored : undefined}
                  />
                </Tooltip>
              </span>
              <Dropdown
                isOpen={isModeMenuOpen}
                onClose={() => setIsModeMenuOpen(false)}
                anchorRef={modeButtonRef}
                align="left"
                width={220}
              >
                {PEEK_MODES.map((option) => (
                  <ListItem
                    key={option.mode}
                    label={option.label}
                    icon={option.icon}
                    className={option.mode === 'side' ? styles.mirroredIcon : undefined}
                    trailing={option.mode === peekMode ? <Check size={16} weight="bold" /> : undefined}
                    onClick={() => {
                      setIsModeMenuOpen(false);
                      onPeekModeChange(option.mode);
                    }}
                  />
                ))}
              </Dropdown>
            </>
          )}

          {showNavigation && (
            <>
              <span className={styles.divider} aria-hidden="true" />
              <ToolbarButton icon={CaretUp} label="Tarefa anterior" onClick={onPrevious} disabled={!onPrevious} />
              <ToolbarButton icon={CaretDown} label="Próxima tarefa" onClick={onNext} disabled={!onNext} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
