/**
 * Records the microphone for a note in ~30 s segments, each a complete m4a
 * file queued for transcription while the recording goes on (same flow as
 * the web, docs/decisions/0003). A segment whose loudest reading stays below
 * the speech threshold is not sent; a reading of digital zero is treated as
 * unreliable and the segment goes up anyway (the server filters silence too).
 */
import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import { transcriptionQueue, uuidV4 } from './transcription-queue';

const SEGMENT_MS = 30_000;
const LEVEL_SAMPLE_MS = 250;
/** Below this the segment is silence (≈ the web's RMS 0.015). */
const SILENCE_DB = -40;
/** What the meter reads on digital zero (no input at all). */
const DIGITAL_ZERO_DB = -159;
/** Shorter tails are dropped when stopping (a tap on start/stop). */
const MIN_SEGMENT_MS = 1000;
/** Upper bound on waiting for iOS/Android to finish writing a stopped file. */
const FINALIZE_TIMEOUT_MS = 4000;

const RECORDING_OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  isMeteringEnabled: true,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.HIGH },
  web: { mimeType: 'audio/webm', bitsPerSecond: 32000 },
};

export type RecorderState = 'idle' | 'starting' | 'recording' | 'stopping';

export type StartResult = 'started' | 'denied' | 'failed';

interface Segment {
  id: string;
  startedAt: number;
  /** Loudest meter reading (dBFS); null when the meter never answered */
  peak: number | null;
}

/** `interrupted`: the recorder failed mid-way and the recording was ended for the user. */
export interface StopInfo {
  interrupted: boolean;
}

export function useNoteRecorder(noteId: string, onStopped: (info: StopInfo) => void) {
  // `stop()` resolves before the file is fully written (the m4a has no index
  // yet and Whisper rejects it); the status event with `isFinished` says it is.
  const onFinished = useRef<(() => void) | null>(null);
  const recorder = useAudioRecorder(RECORDING_OPTIONS, (status) => {
    if (status.isFinished) onFinished.current?.();
  });
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const segment = useRef<Segment | null>(null);
  /** Who started the recording: its segments upload for that account only. */
  const accountId = useRef<string | null>(null);
  const startedAt = useRef(0);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const rolling = useRef(false);
  const stateRef = useRef<RecorderState>('idle');
  const onStoppedRef = useRef(onStopped);
  useEffect(() => {
    onStoppedRef.current = onStopped;
  }, [onStopped]);

  const setRecorderState = (next: RecorderState) => {
    stateRef.current = next;
    setState(next);
  };

  const beginSegment = useCallback(async () => {
    const id = uuidV4();
    await recorder.prepareToRecordAsync({ ...RECORDING_OPTIONS, fileName: id });
    recorder.record();
    segment.current = { id, startedAt: Date.now(), peak: null };
  }, [recorder]);

  /** Stops the current file and queues it. */
  const finishSegment = useCallback(
    async (isLast: boolean) => {
      const current = segment.current;
      segment.current = null;
      const finalized = new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, FINALIZE_TIMEOUT_MS);
        onFinished.current = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      await recorder.stop();
      await finalized;
      onFinished.current = null;
      const uri = recorder.uri;
      if (!current || !uri) return;
      const durationMs = Date.now() - current.startedAt;
      const silent = current.peak !== null && current.peak > DIGITAL_ZERO_DB && current.peak < SILENCE_DB;
      if (silent || (isLast && durationMs < MIN_SEGMENT_MS) || !accountId.current) return;
      transcriptionQueue.enqueue({
        accountId: accountId.current,
        segmentId: current.id,
        noteId,
        uri,
        // Not audio/mp4: the server names the upload after it, and Whisper rejects AAC in a `.mp4`.
        mimeType: 'audio/m4a',
        recordedAt: new Date(current.startedAt).toISOString(),
        durationMs,
      });
    },
    [recorder, noteId],
  );

  const tick = useCallback(async () => {
    const current = segment.current;
    if (!current || stateRef.current !== 'recording') return;
    const metering = recorder.getStatus().metering;
    if (typeof metering === 'number') current.peak = current.peak === null ? metering : Math.max(current.peak, metering);
    setElapsedMs(Date.now() - startedAt.current);
    if (Date.now() - current.startedAt < SEGMENT_MS || rolling.current) return;
    rolling.current = true;
    try {
      await finishSegment(false);
      if (stateRef.current === 'recording') await beginSegment();
      rolling.current = false;
    } catch (error) {
      // Nothing is being captured anymore: end the recording and say so,
      // instead of showing a timer over a dead recorder. What was queued is still transcribed.
      console.warn('segment roll failed', error);
      rolling.current = false;
      if (stateRef.current !== 'recording') return;
      if (ticker.current) clearInterval(ticker.current);
      ticker.current = null;
      segment.current = null;
      await recorder.stop().catch(() => undefined);
      await setAudioModeAsync({ allowsRecording: false, allowsBackgroundRecording: false }).catch(() => undefined);
      setRecorderState('idle');
      onStoppedRef.current({ interrupted: true });
    }
  }, [recorder, finishSegment, beginSegment]);

  const start = useCallback(async (): Promise<StartResult> => {
    if (stateRef.current !== 'idle') return 'failed';
    setRecorderState('starting');
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setRecorderState('idle');
        return 'denied';
      }
      accountId.current = transcriptionQueue.currentAccount();
      if (!accountId.current) {
        setRecorderState('idle');
        return 'failed';
      }
      // Keep recording with the screen locked (a meeting); ignored where unsupported.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, allowsBackgroundRecording: true });
      await beginSegment();
      startedAt.current = Date.now();
      setElapsedMs(0);
      setRecorderState('recording');
      ticker.current = setInterval(() => void tick(), LEVEL_SAMPLE_MS);
      return 'started';
    } catch (error) {
      console.warn('recording failed to start', error);
      setRecorderState('idle');
      return 'failed';
    }
  }, [beginSegment, tick]);

  const stop = useCallback(async () => {
    if (stateRef.current !== 'recording') return;
    setRecorderState('stopping');
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
    // A roll in progress owns the recorder until it finishes.
    while (rolling.current) await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      await finishSegment(true);
    } catch (error) {
      console.warn('recording failed to stop', error);
    }
    await setAudioModeAsync({ allowsRecording: false, allowsBackgroundRecording: false }).catch(() => undefined);
    setRecorderState('idle');
    onStoppedRef.current({ interrupted: false });
  }, [finishSegment]);

  // Leaving the note stops the recording; what was said is still transcribed.
  const stopRef = useRef(stop);
  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);
  useEffect(() => () => void stopRef.current(), []);

  return { state, elapsedMs, start, stop };
}

/** "1:05" / "1:02:05" */
export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}
