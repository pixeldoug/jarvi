/**
 * NoteIcon — page with a folded corner and a wavy line ("Notas"). Drawn on a
 * 16 grid and scaled onto Phosphor's 256 grid, then rendered through its
 * IconBase: it takes `size` / `weight` / `color` like any other Phosphor icon.
 */

import { forwardRef, type ReactElement } from 'react';
import { IconBase, type Icon, type IconWeight } from '@phosphor-icons/react';

const PAGE =
  'M3.33333 2H12.6667C13.4033 2 14 2.59667 14 3.33333V11.0667L11.0667 14H3.33333C2.59667 14 2 13.4033 2 12.6667V3.33333C2 2.59667 2.59667 2 3.33333 2Z';
const FOLD = 'M10.4 13.9999V11.6666C10.4 10.9666 10.9667 10.3999 11.6667 10.3999H14';
const WAVE =
  'M4.66669 7.40007C5.36669 7.40007 5.76669 6.86673 6.03335 6.2334C6.30002 6.90007 6.70002 7.40007 7.40002 7.40007C8.10002 7.40007 8.50002 6.86673 8.76669 6.2334C9.03335 6.90007 9.43335 7.40007 10.1334 7.40007C10.8334 7.40007 11.2334 6.86673 11.5 6.2334';

// Stroke widths are in 16-grid units (×16 = Phosphor's 256-grid widths)
function glyph(strokeWidth: number, page: 'stroke' | 'duotone'): ReactElement {
  const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <g transform="scale(16)">
      {page === 'duotone' && <path d={PAGE} opacity="0.2" />}
      <path d={PAGE} {...stroke} />
      <path d={FOLD} {...stroke} />
      <path d={WAVE} {...stroke} />
    </g>
  );
}

const weights = new Map<IconWeight, ReactElement>([
  ['thin', glyph(0.5, 'stroke')],
  ['light', glyph(0.75, 'stroke')],
  ['regular', glyph(1, 'stroke')],
  ['bold', glyph(1.5, 'stroke')],
  ['fill', glyph(1, 'stroke')],
  ['duotone', glyph(1, 'duotone')],
]);

export const NoteIcon: Icon = forwardRef((props, ref) => (
  <IconBase ref={ref} {...props} weights={weights} />
));

NoteIcon.displayName = 'NoteIcon';
