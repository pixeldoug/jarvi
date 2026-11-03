/**
 * SummaryIcon — text lines + sparkle ("AI summary"). Phosphor has no such
 * glyph, so it is drawn on Phosphor's 256 grid and rendered through its
 * IconBase: it takes `size` / `weight` / `color` like any other Phosphor icon.
 */

import { forwardRef, type ReactElement } from 'react';
import { IconBase, type Icon, type IconWeight } from '@phosphor-icons/react';

const LINES = 'M40,64H216M40,112H136M40,160H96';
// Four-point star (Sparkle's silhouette) centred at (180, 156)
const STAR = 'M180,96L196,140L240,156L196,172L180,216L164,172L120,156L164,140Z';

function glyph(strokeWidth: number, star: 'stroke' | 'fill' | 'duotone'): ReactElement {
  const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <>
      <path d={LINES} {...stroke} />
      {star === 'duotone' && <path d={STAR} opacity="0.2" />}
      {star === 'fill' ? (
        <path d={STAR} {...stroke} fill="currentColor" />
      ) : (
        <path d={STAR} {...stroke} />
      )}
    </>
  );
}

const weights = new Map<IconWeight, ReactElement>([
  ['thin', glyph(8, 'stroke')],
  ['light', glyph(12, 'stroke')],
  ['regular', glyph(16, 'stroke')],
  ['bold', glyph(24, 'stroke')],
  ['fill', glyph(16, 'fill')],
  ['duotone', glyph(16, 'duotone')],
]);

export const SummaryIcon: Icon = forwardRef((props, ref) => (
  <IconBase ref={ref} {...props} weights={weights} />
));

SummaryIcon.displayName = 'SummaryIcon';
