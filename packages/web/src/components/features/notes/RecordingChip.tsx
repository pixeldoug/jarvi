/**
 * RecordingChip — non-interactive "Gravando · 01:23" status, shown in the
 * note toolbar while the ControlBar (and its record control) is hidden.
 */

import { Waveform } from '@phosphor-icons/react';
import { Chip } from '../../ui';
import { useElapsed } from './useElapsed';

export function RecordingChip({ startedAt }: { startedAt: number | null }) {
  const elapsed = useElapsed(startedAt);
  return (
    <Chip
      label={`Gravando · ${elapsed}`}
      icon={<Waveform size={16} weight="regular" />}
      size="medium"
      chipStyle="filled"
    />
  );
}
