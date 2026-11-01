/**
 * Microphone recorder for notes (module singleton — there is one mic).
 *
 * Audio is cut into ~30 s segments, one MediaRecorder per segment, because
 * timeslice chunks are not decodable on their own. The next recorder starts
 * on the same stream just before the previous one stops, so no audio is lost
 * between segments. Each finished segment is handed to `onSegment` bound to
 * the note that was recording when it was captured.
 *
 * An AnalyserNode provides the live level (for the meter) and a per-segment
 * peak, so silent segments can be skipped instead of uploaded.
 */

import { useSyncExternalStore } from 'react';
import { captureProductEvent } from '../../../lib/productAnalytics';
import { toast } from '../../ui/Sonner';

export type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'stopping';

export interface RecorderSnapshot {
  status: RecorderStatus;
  /** Note being recorded (or about to be) */
  noteId: string | null;
  /** Date.now() when audio capture began; null until then */
  startedAt: number | null;
}

export interface CapturedSegment {
  noteId: string;
  blob: Blob;
  mimeType: string;
  /** ISO wall-clock start of the segment */
  recordedAt: string;
  durationMs: number;
}

export interface RecordingResult {
  noteId: string;
  durationMs: number;
  /** Segments handed to `onSegment` (silent ones are not counted) */
  segments: number;
  /** True when stopped with `discard` (e.g. the note was deleted) */
  discarded: boolean;
}

export interface StartRecordingOptions {
  noteId: string;
  /** '' / undefined = system default microphone */
  deviceId?: string;
  onSegment: (segment: CapturedSegment) => void;
  onFinished?: (result: RecordingResult) => void;
}

const SEGMENT_MS = 30_000;
const AUDIO_BITS_PER_SECOND = 32_000;
/** Peak RMS below this means the segment is silence. */
const SILENCE_RMS = 0.015;
const LEVEL_SAMPLE_MS = 100;
/** Safety net in case a MediaRecorder never fires `stop`. */
const FINALIZE_TIMEOUT_MS = 4000;

const MIME_TYPE_PREFERENCE = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

interface ActiveSegment {
  noteId: string;
  recorder: MediaRecorder;
  chunks: Blob[];
  startedAt: number;
  stoppedAt: number | null;
  peak: number;
  samples: number;
  /** The tab was hidden at some point: level sampling was throttled. */
  sawHidden: boolean;
  /** Last segment of the recording */
  final: boolean;
  onSegment: StartRecordingOptions['onSegment'];
}

export function isRecordingSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

function pickMimeType(): string {
  if (typeof MediaRecorder.isTypeSupported !== 'function') return '';
  return MIME_TYPE_PREFERENCE.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

function errorName(error: unknown): string {
  return error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
}

async function requestStream(deviceId?: string): Promise<MediaStream> {
  const base: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { ...base, deviceId: { exact: deviceId } } : base,
    });
  } catch (error) {
    // The saved microphone was unplugged — fall back to the default one.
    const name = errorName(error);
    if (deviceId && (name === 'OverconstrainedError' || name === 'NotFoundError')) {
      return navigator.mediaDevices.getUserMedia({ audio: base });
    }
    throw error;
  }
}

function startErrorMessage(error: unknown): string {
  switch (errorName(error)) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Permita o acesso ao microfone no navegador para gravar.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Nenhum microfone encontrado.';
    default:
      return 'Não foi possível iniciar a gravação.';
  }
}

const IDLE: RecorderSnapshot = { status: 'idle', noteId: null, startedAt: null };

class NoteRecorder {
  private snapshot: RecorderSnapshot = IDLE;
  private listeners = new Set<() => void>();
  /** Bumped on every start / cancel so stale async work can bail out. */
  private session = 0;
  private options: StartRecordingOptions | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  /**
   * Held on purpose: Chrome garbage-collects an unreferenced
   * MediaStreamAudioSourceNode whose graph doesn't reach the destination, and
   * the analyser then reads pure zeros for the rest of the recording.
   */
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private sampleBuffer: Float32Array<ArrayBuffer> | null = null;
  private sampleTimer: number | null = null;
  private segmentTimer: number | null = null;
  private finalizeTimer: number | null = null;
  private current: ActiveSegment | null = null;
  /** Segments whose recorder has not delivered its data yet */
  private unflushed = new Set<ActiveSegment>();
  private mimeType = '';
  private segmentsDelivered = 0;
  private discardFinal = false;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): RecorderSnapshot => this.snapshot;

  /** Current input RMS (0..1). Cheap enough to call every animation frame. */
  getLevel = (): number => (this.snapshot.status === 'recording' ? this.sample() : 0);

  start = async (options: StartRecordingOptions): Promise<boolean> => {
    if (this.snapshot.status !== 'idle') return false;
    if (!isRecordingSupported()) {
      toast.error('Não foi possível iniciar a gravação.');
      return false;
    }

    const session = ++this.session;
    this.options = options;
    this.segmentsDelivered = 0;
    this.discardFinal = false;
    this.setSnapshot({ status: 'requesting', noteId: options.noteId, startedAt: null });

    let stream: MediaStream;
    try {
      stream = await requestStream(options.deviceId || undefined);
    } catch (error) {
      if (session !== this.session) return false;
      this.options = null;
      this.setSnapshot(IDLE);
      toast.error(startErrorMessage(error));
      return false;
    }

    // Cancelled while the permission prompt was open.
    if (session !== this.session) {
      stream.getTracks().forEach((track) => track.stop());
      return false;
    }

    this.stream = stream;
    this.mimeType = pickMimeType();
    this.setupAnalyser(stream);
    stream.getAudioTracks().forEach((track) => track.addEventListener('ended', this.handleTrackEnded));

    try {
      this.current = this.startSegment(options.noteId, options.onSegment);
    } catch (error) {
      console.error('MediaRecorder failed to start:', error);
      this.teardown();
      this.options = null;
      this.setSnapshot(IDLE);
      toast.error('Não foi possível iniciar a gravação.');
      return false;
    }

    this.setSnapshot({ status: 'recording', noteId: options.noteId, startedAt: Date.now() });
    captureProductEvent('note_recording_started');
    return true;
  };

  /**
   * Stops the recording and delivers the final segment. With `discard`, the
   * final segment is dropped (the note is being deleted).
   */
  stop = (opts: { discard?: boolean } = {}): void => {
    const { status } = this.snapshot;
    if (status === 'requesting') {
      this.session += 1;
      this.options = null;
      this.setSnapshot(IDLE);
      return;
    }
    if (status === 'stopping') {
      if (opts.discard) this.discardFinal = true;
      return;
    }
    if (status !== 'recording') return;

    this.discardFinal = !!opts.discard;
    this.setSnapshot({ ...this.snapshot, status: 'stopping' });
    this.clearSegmentTimer();
    this.finalizeTimer = window.setTimeout(() => this.finalize(true), FINALIZE_TIMEOUT_MS);

    const segment = this.current;
    this.current = null;
    if (segment) {
      segment.final = true;
      if (segment.recorder.state !== 'inactive') this.stopSegment(segment);
      else this.deliverSegment(segment);
    }
    this.finalize(false);
  };

  // ── Segments ────────────────────────────────────────────────────────────────

  private startSegment(noteId: string, onSegment: ActiveSegment['onSegment']): ActiveSegment {
    if (!this.stream) throw new Error('no_stream');
    const recorder = new MediaRecorder(
      this.stream,
      this.mimeType
        ? { mimeType: this.mimeType, audioBitsPerSecond: AUDIO_BITS_PER_SECOND }
        : { audioBitsPerSecond: AUDIO_BITS_PER_SECOND },
    );
    const segment: ActiveSegment = {
      noteId,
      recorder,
      chunks: [],
      startedAt: Date.now(),
      stoppedAt: null,
      peak: 0,
      samples: 0,
      sawHidden: document.hidden,
      final: false,
      onSegment,
    };

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) segment.chunks.push(event.data);
    };
    recorder.onstop = () => this.deliverSegment(segment);
    recorder.onerror = (event) => {
      console.error('MediaRecorder error:', event);
      if (this.current === segment) this.stop();
    };

    recorder.start();
    this.unflushed.add(segment);
    this.segmentTimer = window.setTimeout(this.rollSegment, SEGMENT_MS);
    return segment;
  }

  private rollSegment = () => {
    this.segmentTimer = null;
    const previous = this.current;
    if (!previous || this.snapshot.status !== 'recording') return;
    try {
      // Start the next recorder first so the two overlap by a few ms.
      this.current = this.startSegment(previous.noteId, previous.onSegment);
    } catch (error) {
      console.error('MediaRecorder failed to roll over:', error);
      this.stop();
      return;
    }
    this.stopSegment(previous);
  };

  private stopSegment(segment: ActiveSegment) {
    segment.stoppedAt = Date.now();
    try {
      segment.recorder.stop();
    } catch {
      this.deliverSegment(segment);
    }
  }

  private deliverSegment(segment: ActiveSegment) {
    if (!this.unflushed.has(segment)) return;
    this.unflushed.delete(segment);

    const durationMs = (segment.stoppedAt ?? Date.now()) - segment.startedAt;
    const mimeType = segment.recorder.mimeType || this.mimeType || 'audio/webm';
    const blob = new Blob(segment.chunks, { type: mimeType });

    // Level data is only trustworthy when the analyser ran the whole time.
    // A peak of exactly 0 is digital silence — a detached graph, not a quiet
    // room (a live mic always carries some noise) — so it never counts.
    const levelReliable =
      this.audioContext?.state === 'running' &&
      !segment.sawHidden &&
      segment.peak > 0 &&
      segment.samples >= Math.max(5, durationMs / 500);
    const isSilent = levelReliable && segment.peak < SILENCE_RMS;
    const isDiscarded = segment.final && this.discardFinal;

    if (blob.size > 0 && !isSilent && !isDiscarded) {
      this.segmentsDelivered += 1;
      segment.onSegment({
        noteId: segment.noteId,
        blob,
        mimeType,
        recordedAt: new Date(segment.startedAt).toISOString(),
        durationMs,
      });
    }

    if (this.snapshot.status === 'stopping') this.finalize(false);
  }

  private finalize(force: boolean) {
    if (this.snapshot.status !== 'stopping') return;
    if (!force && this.unflushed.size > 0) return;

    if (this.finalizeTimer !== null) {
      window.clearTimeout(this.finalizeTimer);
      this.finalizeTimer = null;
    }
    this.unflushed.clear();

    const { noteId, startedAt } = this.snapshot;
    const result: RecordingResult = {
      noteId: noteId ?? '',
      durationMs: startedAt ? Date.now() - startedAt : 0,
      segments: this.segmentsDelivered,
      discarded: this.discardFinal,
    };
    const onFinished = this.options?.onFinished;

    this.teardown();
    this.options = null;
    this.setSnapshot(IDLE);

    captureProductEvent('note_recording_stopped', {
      duration_ms: result.durationMs,
      segments: result.segments,
    });
    onFinished?.(result);
  }

  private handleTrackEnded = () => {
    if (this.snapshot.status !== 'recording') return;
    toast.warning('A gravação foi interrompida.');
    this.stop();
  };

  // ── Level analysis ──────────────────────────────────────────────────────────

  private setupAnalyser(stream: MediaStream) {
    try {
      const AudioContextCtor: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;
      const context = new AudioContextCtor();
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      this.sourceNode = source;
      this.audioContext = context;
      this.analyser = analyser;
      this.sampleBuffer = new Float32Array(analyser.fftSize);
      if (context.state === 'suspended') void context.resume().catch(() => undefined);
      this.sampleTimer = window.setInterval(() => this.sample(), LEVEL_SAMPLE_MS);
    } catch (error) {
      // Without levels we upload every segment and show a flat meter.
      console.warn('AudioContext unavailable for note recording:', error);
    }
  }

  private sample(): number {
    const { analyser, sampleBuffer } = this;
    if (!analyser || !sampleBuffer) return 0;
    analyser.getFloatTimeDomainData(sampleBuffer);
    let sum = 0;
    for (let i = 0; i < sampleBuffer.length; i += 1) sum += sampleBuffer[i] * sampleBuffer[i];
    const rms = Math.sqrt(sum / sampleBuffer.length);

    const segment = this.current;
    if (segment) {
      if (rms > segment.peak) segment.peak = rms;
      segment.samples += 1;
      if (document.hidden) segment.sawHidden = true;
    }
    return rms;
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  private clearSegmentTimer() {
    if (this.segmentTimer !== null) {
      window.clearTimeout(this.segmentTimer);
      this.segmentTimer = null;
    }
  }

  private teardown() {
    this.clearSegmentTimer();
    if (this.sampleTimer !== null) {
      window.clearInterval(this.sampleTimer);
      this.sampleTimer = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        track.removeEventListener('ended', this.handleTrackEnded);
        track.stop();
      });
      this.stream = null;
    }
    this.sourceNode?.disconnect();
    this.sourceNode = null;
    if (this.audioContext) {
      void this.audioContext.close().catch(() => undefined);
      this.audioContext = null;
    }
    this.analyser = null;
    this.sampleBuffer = null;
    this.current = null;
  }

  private setSnapshot(next: RecorderSnapshot) {
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}

export const noteRecorder = new NoteRecorder();

export function useNoteRecorder(): RecorderSnapshot {
  return useSyncExternalStore(noteRecorder.subscribe, noteRecorder.getSnapshot);
}

/** mm:ss (h:mm:ss past one hour) */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
