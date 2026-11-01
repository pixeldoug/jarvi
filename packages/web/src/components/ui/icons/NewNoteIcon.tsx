/**
 * NewNoteIcon — the Notas page (NoteIcon) with a pencil on its top-right
 * corner ("Nova nota"). Drawn on a 16 grid and scaled onto Phosphor's 256
 * grid, then rendered through its IconBase: it takes `size` / `weight` /
 * `color` like any other Phosphor icon. The pencil is a filled shape, the
 * same in every weight.
 */

import { forwardRef, type ReactElement } from 'react';
import { IconBase, type Icon, type IconWeight } from '@phosphor-icons/react';

// The page, open at the top-right corner where the pencil sits
const PAGE =
  'M8.3 2H3.33333C2.59667 2 2 2.59667 2 3.33333V12.6667C2 13.4033 2.59667 14 3.33333 14H11.0667L14 11.0667V8.5';
const FOLD = 'M10.4 13.9999V11.6666C10.4 10.9666 10.9667 10.3999 11.6667 10.3999H14';
const WAVE = 'M4.66663 7.40007C5.36663 7.40007 5.76663 6.86673 6.03329 6.2334C6.29996 6.90007 6.69996 7.40007 7.39996 7.40007';
const PENCIL =
  'M14.0602 0.5C14.5229 0.497 14.7151 0.833527 15.0182 1.12012C15.2688 1.36286 15.4856 1.56576 15.4811 1.93945C15.4768 2.28205 15.3266 2.45521 15.0905 2.68164C14.982 2.78563 14.869 2.9028 14.7623 3.00977L13.6246 4.15039L9.68616 8.09668C9.60682 8.09912 9.52181 8.09831 9.44202 8.09863C9.12512 8.09745 8.80562 8.09933 8.48694 8.09961C8.16231 8.09989 7.90229 7.83439 7.90295 7.50977C7.90377 7.10942 7.90245 6.70894 7.90002 6.30859L11.7975 2.4082L12.9313 1.27344C13.007 1.19758 13.0842 1.11985 13.1598 1.04395C13.4275 0.775204 13.5717 0.57348 13.9606 0.504883C13.9936 0.50153 14.027 0.500125 14.0602 0.5ZM9.98694 5.39453L9.16663 6.21484C9.02757 6.35382 8.87252 6.51631 8.7301 6.64941C8.73054 6.84917 8.73416 7.05784 8.73108 7.25684C8.916 7.257 9.16144 7.24956 9.34143 7.25977C9.39164 7.18484 9.69581 6.89054 9.77405 6.8125L10.7311 5.85742L13.1168 3.47168C13.2206 3.36797 13.358 3.22429 13.4664 3.12988C13.2881 2.95797 13.0203 2.70592 12.8629 2.52051L9.98694 5.39453Z';

// Stroke widths are in 16-grid units (×16 = Phosphor's 256-grid widths)
function glyph(strokeWidth: number): ReactElement {
  const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <g transform="scale(16)">
      <path d={PAGE} {...stroke} />
      <path d={FOLD} {...stroke} />
      <path d={WAVE} {...stroke} />
      <path d={PENCIL} fill="currentColor" />
    </g>
  );
}

const weights = new Map<IconWeight, ReactElement>([
  ['thin', glyph(0.5)],
  ['light', glyph(0.75)],
  ['regular', glyph(1)],
  ['bold', glyph(1.5)],
  ['fill', glyph(1)],
  ['duotone', glyph(1)],
]);

export const NewNoteIcon: Icon = forwardRef((props, ref) => (
  <IconBase ref={ref} {...props} weights={weights} />
));

NewNoteIcon.displayName = 'NewNoteIcon';
