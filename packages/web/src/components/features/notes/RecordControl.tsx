/**
 * RecordControl — the ControlBar's dark group in Notes (its `leading` slot):
 * a status indicator (waveform at rest; live level meter + elapsed while
 * recording) next to one action segment ("Gravar" → "Parar").
 * The level meter is driven by requestAnimationFrame with direct style
 * updates (no React render per frame).
 */

import { useEffect, useRef } from 'react';
import { Play, Stop, Waveform } from '@phosphor-icons/react';
import { ControlBarToggleButton, Loading, Tooltip } from '../../ui';
import { noteRecorder, type RecorderStatus } from './useNoteRecorder';
import { useElapsed } from './useElapsed';
import styles from './RecordControl.module.css';

/** Relative height of each meter bar — the middle reacts the most. */
const BAR_WEIGHTS = [0.55, 0.8, 1, 0.8, 0.55];
const MIN_BAR_SCALE = 0.18;

export interface RecordControlProps {
  status: RecorderStatus;
  startedAt: number | null;
  /** MediaRecorder / getUserMedia available */
  supported: boolean;
  /** Extra busy state before recording starts (e.g. creating the note) */
  isPreparing?: boolean;
  /** Disables the start button and explains why in a tooltip */
  disabledReason?: string;
  onStart: () => void;
  onStop: () => void;
}

function LevelMeter() {
  const barsRef = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    let frame = 0;
    let smoothed = 0;
    const tick = () => {
      const rms = noteRecorder.getLevel();
      // Perceptual curve: quiet speech still moves the bars.
      const target = Math.min(1, Math.sqrt(rms) * 2.4);
      // Fast attack, slower release.
      smoothed = target > smoothed ? smoothed + (target - smoothed) * 0.6 : smoothed * 0.85;
      barsRef.current.forEach((bar, i) => {
        if (!bar) return;
        const scale = MIN_BAR_SCALE + (1 - MIN_BAR_SCALE) * smoothed * BAR_WEIGHTS[i];
        bar.style.transform = `scaleY(${scale.toFixed(3)})`;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <span className={styles.meter} aria-hidden="true">
      {BAR_WEIGHTS.map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          className={styles.bar}
        />
      ))}
    </span>
  );
}

/** Left half of the group: what the mic is doing (not a button). */
function Indicator({ status, startedAt }: { status: RecorderStatus; startedAt: number | null }) {
  const elapsed = useElapsed(startedAt);
  const isLive = status === 'recording' || status === 'stopping';

  if (!isLive) {
    return (
      <span className={styles.indicator} aria-hidden="true">
        <Waveform size={18} />
      </span>
    );
  }

  return (
    <span className={`${styles.indicator} ${styles.indicatorLive}`}>
      {status === 'recording' && <LevelMeter />}
      <span className={styles.elapsed} role="timer" aria-label={`Tempo de gravação: ${elapsed}`}>
        {elapsed}
      </span>
    </span>
  );
}

export function RecordControl({
  status,
  startedAt,
  supported,
  isPreparing = false,
  disabledReason,
  onStart,
  onStop,
}: RecordControlProps) {
  const indicator = <Indicator status={status} startedAt={startedAt} />;

  if (status === 'recording') {
    return (
      <>
        {indicator}
        <ControlBarToggleButton
          active
          aria-label="Parar gravação"
          onClick={onStop}
          icon={<Stop size={16} weight="fill" />}
        >
          <span className={styles.label}>Parar</span>
        </ControlBarToggleButton>
      </>
    );
  }

  if (status === 'stopping') {
    return (
      <>
        {indicator}
        <ControlBarToggleButton active disabled aria-busy="true" icon={<Loading size="sm" />}>
          <span className={styles.label}>Salvando…</span>
        </ControlBarToggleButton>
      </>
    );
  }

  const isBusy = status === 'requesting' || isPreparing;
  const tooltip = !supported
    ? 'Seu navegador não permite gravar áudio aqui.'
    : disabledReason;

  const button = (
    <ControlBarToggleButton
      active
      aria-label="Começar gravação"
      aria-busy={isBusy || undefined}
      disabled={!supported || !!disabledReason || isBusy}
      onClick={onStart}
      icon={isBusy ? <Loading size="sm" /> : <Play size={16} weight="fill" />}
    >
      <span className={styles.label}>Gravar</span>
    </ControlBarToggleButton>
  );

  return (
    <>
      {indicator}
      {tooltip ? (
        <Tooltip label={tooltip} position="top">
          {button}
        </Tooltip>
      ) : (
        button
      )}
    </>
  );
}
