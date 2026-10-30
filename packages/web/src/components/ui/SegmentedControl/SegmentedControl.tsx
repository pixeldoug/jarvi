/**
 * SegmentedControl — pick one of a few views / sections.
 *
 * Bordered track with a raised active pill: taller than the track (it
 * overflows it evenly, ChatGPT-style), lightly shadowed, and sliding between
 * segments (one shared Motion `layoutId` element). Segments glide to their new
 * spots when the active one changes width.
 *
 * - `display="labels"` (default): every segment shows its label (+ icon).
 * - `display="compact"`: only the active segment shows its label; the others
 *   are icon-only with a tooltip (every item needs an `icon`).
 * - `semantics="radio"` (default) for a view switch; `"tabs"` when segments
 *   control tab panels (pass `id` + `panelId` per item).
 *
 * Arrow keys move the selection (roving tabindex). Motion is off for users
 * who prefer reduced motion.
 */

import { useId, useRef, type KeyboardEvent } from 'react';
import type { Icon } from '@phosphor-icons/react';
import { LayoutGroup, MotionConfig, motion } from 'motion/react';
import { Button } from '../Button';
import { Tooltip } from '../Tooltip';
import styles from './SegmentedControl.module.css';

/** Pill slide timing; reuse it for content that moves with the selection. */
export const SEGMENTED_CONTROL_TRANSITION = { duration: 0.25, ease: [0.4, 0, 0.2, 1] } as const;

export interface SegmentedControlItem<T extends string> {
  value: T;
  label: string;
  icon?: Icon;
  /** Element id of the segment (tabs: referenced by the panel's aria-labelledby) */
  id?: string;
  /** Tabs only: id of the panel this segment controls */
  panelId?: string;
}

export interface SegmentedControlProps<T extends string> {
  items: ReadonlyArray<SegmentedControlItem<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group */
  'aria-label': string;
  display?: 'labels' | 'compact';
  semantics?: 'radio' | 'tabs';
  className?: string;
}

export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  'aria-label': ariaLabel,
  display = 'labels',
  semantics = 'radio',
  className = '',
}: SegmentedControlProps<T>) {
  const groupId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const isTabs = semantics === 'tabs';

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const index = items.findIndex((item) => item.value === value);
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = items[(index + delta + items.length) % items.length];
    onChange(next.value);
    // Buttons are never remounted, so the next one can take focus right away
    listRef.current
      ?.querySelector<HTMLButtonElement>(`[data-segment-index="${items.indexOf(next)}"]`)
      ?.focus();
  };

  const classes = [styles.track, display === 'compact' ? styles.compact : styles.labels, className]
    .filter(Boolean)
    .join(' ');

  return (
    <MotionConfig reducedMotion="user" transition={SEGMENTED_CONTROL_TRANSITION}>
      <LayoutGroup id={groupId}>
        <div
          ref={listRef}
          className={classes}
          role={isTabs ? 'tablist' : 'radiogroup'}
          aria-label={ariaLabel}
          onKeyDown={handleKeyDown}
        >
          {items.map((item, index) => {
            const isActive = item.value === value;
            const showLabel = display === 'labels' || isActive;
            const button = (
              <Button
                id={item.id}
                variant="ghost"
                size="small"
                icon={item.icon}
                iconPosition={item.icon ? (showLabel ? 'left' : 'icon-only') : 'none'}
                active={isActive}
                className={styles.segment}
                data-segment-index={index}
                data-active={isActive}
                role={isTabs ? 'tab' : 'radio'}
                aria-selected={isTabs ? isActive : undefined}
                aria-checked={isTabs ? undefined : isActive}
                aria-controls={isTabs ? item.panelId : undefined}
                aria-label={showLabel ? undefined : item.label}
                tabIndex={isActive ? 0 : -1}
                onClick={() => {
                  if (!isActive) onChange(item.value);
                }}
              >
                {showLabel ? item.label : undefined}
              </Button>
            );

            // Same wrapper in every state so the button is not remounted (keeps focus).
            // `layout="position"`: the segment glides to its new spot instead of jumping.
            const slot = (
              <motion.span layout="position" className={styles.slot}>
                {isActive && (
                  <motion.span
                    layoutId="segmented-control-pill"
                    className={styles.pill}
                    // In `style` so Motion keeps it undistorted while it scales the pill
                    style={{ borderRadius: 16 }}
                    aria-hidden="true"
                  />
                )}
                {button}
              </motion.span>
            );

            return (
              <Tooltip
                key={item.value}
                label={item.label}
                position="bottom"
                disabled={showLabel}
              >
                {slot}
              </Tooltip>
            );
          })}
        </div>
      </LayoutGroup>
    </MotionConfig>
  );
}
