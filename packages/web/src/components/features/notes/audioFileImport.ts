/**
 * Audio file import (module singleton): transcribes an uploaded audio file
 * through the same pipeline as a recording.
 *
 * The file is decoded in the browser (resampled to 16 kHz), cut into 60 s
 * mono WAV chunks and fed to `transcriptionQueue` — so it gets the same
 * ordering, retries, Whisper continuity, silence filtering and auto summary.
 * The audio itself is never stored (decision 0003). Chunks are encoded lazily,
 * a few at a time, so a long file never sits in memory as hundreds of blobs.
 */

import { useSyncExternalStore } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { transcriptionQueue } from './transcriptionQueue';

export const AUDIO_IMPORT_ACCEPT =
  'audio/*,video/mp4,video/webm,.mp3,.m4a,.wav,.ogg,.oga,.opus,.webm,.aac,.flac,.mp4';
export const AUDIO_IMPORT_MAX_BYTES = 200 * 1024 * 1024;
export const AUDIO_IMPORT_MAX_DURATION_MS = 2 * 60 * 60 * 1000;
/** Shown next to the CTA */
export const AUDIO_IMPORT_HINT = 'MP3, M4A, WAV, OGG… até 2 h';

const SAMPLE_RATE = 16_000;
const CHUNK_SECONDS = 60;
/** Chunks queued ahead of the one transcribing */
const MAX_IN_FLIGHT = 3;

export interface AudioImportState {
  noteId: string;
  fileName: string;
  phase: 'decoding' | 'transcribing';
  /** Chunks handed to the queue so far / in total (0 while decoding) */
  sentChunks: number;
  totalChunks: number;
}

export class AudioImportError extends Error {}

let current: AudioImportState | null = null;
let cancelRequested = false;
const listeners = new Set<() => void>();

function setState(next: AudioImportState | null) {
  current = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Resolves when this note has fewer than `max` chunks queued / uploading. */
function waitForRoom(noteId: string, max: number): Promise<void> {
  if (transcriptionQueue.pendingCount(noteId) < max) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = transcriptionQueue.subscribe(() => {
      if (transcriptionQueue.pendingCount(noteId) < max || cancelRequested) {
        unsubscribe();
        resolve();
      }
    });
  });
}

/** One mono 16-bit PCM WAV from `buffer` samples [start, end), channels averaged. */
function encodeWavChunk(buffer: AudioBuffer, start: number, end: number): Blob {
  const length = end - start;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const view = new DataView(new ArrayBuffer(44 + length * 2));
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i += 1) {
    let sample = 0;
    for (const data of channels) sample += data[start + i];
    sample = Math.max(-1, Math.min(1, sample / channels.length));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([view], { type: 'audio/wav' });
}

async function decode(file: File): Promise<AudioBuffer> {
  const data = await file.arrayBuffer();
  // An OfflineAudioContext decodes without a user-gesture / autoplay unlock
  // and resamples to its own rate.
  const context = new OfflineAudioContext(1, SAMPLE_RATE, SAMPLE_RATE);
  try {
    return await context.decodeAudioData(data);
  } catch {
    throw new AudioImportError('Não foi possível ler este arquivo. Tente um MP3, M4A ou WAV.');
  }
}

export const audioFileImport = {
  /**
   * Transcribes `file` into `noteId`. Resolves once every chunk is
   * transcribed; throws `AudioImportError` for files it cannot take. Returns
   * false when the user cancelled (chunks already queued still finish).
   */
  async start(queryClient: QueryClient, noteId: string, file: File): Promise<boolean> {
    if (current) throw new AudioImportError('Já tem um arquivo sendo transcrito. Aguarde terminar.');
    if (file.size > AUDIO_IMPORT_MAX_BYTES) {
      throw new AudioImportError('O arquivo passa de 200 MB.');
    }

    cancelRequested = false;
    setState({ noteId, fileName: file.name, phase: 'decoding', sentChunks: 0, totalChunks: 0 });
    try {
      const buffer = await decode(file);
      const durationMs = buffer.duration * 1000;
      if (durationMs > AUDIO_IMPORT_MAX_DURATION_MS) {
        throw new AudioImportError('O áudio passa de 2 horas. Envie um arquivo mais curto.');
      }
      if (cancelRequested) return false;

      const chunkSamples = CHUNK_SECONDS * buffer.sampleRate;
      const totalChunks = Math.max(1, Math.ceil(buffer.length / chunkSamples));
      // As if the audio had just been recorded: past timestamps. The queue
      // moves them after the note's existing audio when they would overlap.
      const startedAt = Date.now() - durationMs;
      setState({ noteId, fileName: file.name, phase: 'transcribing', sentChunks: 0, totalChunks });

      for (let index = 0; index < totalChunks; index += 1) {
        await waitForRoom(noteId, MAX_IN_FLIGHT);
        if (cancelRequested) return false;
        const start = index * chunkSamples;
        const end = Math.min(start + chunkSamples, buffer.length);
        transcriptionQueue.enqueue(queryClient, {
          noteId,
          blob: encodeWavChunk(buffer, start, end),
          mimeType: 'audio/wav',
          recordedAt: new Date(startedAt + (start / buffer.sampleRate) * 1000).toISOString(),
          durationMs: ((end - start) / buffer.sampleRate) * 1000,
        });
        setState({ noteId, fileName: file.name, phase: 'transcribing', sentChunks: index + 1, totalChunks });
      }
      // Keep reporting progress until the last chunk is transcribed.
      await transcriptionQueue.whenIdle(noteId);
      return true;
    } finally {
      setState(null);
    }
  },

  /** Stops queueing the rest of the file (chunks already queued still finish). */
  cancel(): void {
    cancelRequested = true;
    listeners.forEach((listener) => listener());
  },

  getSnapshot(): AudioImportState | null {
    return current;
  },
};

/** The import running for `noteId`, if any. */
export function useAudioImport(noteId: string | undefined): AudioImportState | null {
  return useSyncExternalStore(subscribe, () =>
    current && current.noteId === noteId ? current : null,
  );
}

/** Any import running (a second one waits for it). */
export function useIsImportingAudio(): boolean {
  return useSyncExternalStore(subscribe, () => current !== null);
}
