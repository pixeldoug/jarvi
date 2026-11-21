/**
 * Ordering and ownership rules of the module-level note saves and the
 * transcription queue (network and files mocked).
 */
import type { QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/api/client';
import type { NotePatch } from '@/types/notes';

const mockSaveNotePatch = jest.fn<Promise<void>, [QueryClient, string, NotePatch]>();
jest.mock('./use-notes', () => ({
  saveNotePatch: (...args: [QueryClient, string, NotePatch]) => mockSaveNotePatch(...args),
  cacheSegment: jest.fn(),
}));

const mockTranscribe = jest.fn();
jest.mock('@/api/endpoints', () => ({ notesApi: { transcribe: (...args: unknown[]) => mockTranscribe(...args) } }));

const mockDeletedFiles: string[] = [];
jest.mock('expo-file-system', () => ({
  File: function MockFile(this: { base64: () => Promise<string>; delete: () => void }, mockUri: string) {
    this.base64 = () => Promise.resolve('AAAA');
    this.delete = () => {
      mockDeletedFiles.push(mockUri);
    };
  },
}));

// eslint-disable-next-line import/first
import { noteSaves } from './note-saves';
// eslint-disable-next-line import/first
import { transcriptionQueue } from './transcription-queue';

const client = {} as QueryClient;

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('noteSaves', () => {
  beforeEach(() => mockSaveNotePatch.mockReset());

  it('sends one save at a time, in order, and flush waits for the earlier ones', async () => {
    const first = deferred();
    mockSaveNotePatch.mockReturnValueOnce(first.promise).mockResolvedValue(undefined);

    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    noteSaves.schedule(client, 'n1', { content: 'old' }, 10_000);
    const one = noteSaves.flush(client, 'n1');
    await tick(); // the older request is in flight
    noteSaves.schedule(client, 'n1', { content: 'new' }, 10_000);
    const two = noteSaves.flush(client, 'n1');

    await tick();
    // The newer edit waits for the older request instead of racing it.
    expect(mockSaveNotePatch).toHaveBeenCalledTimes(1);
    first.resolve();
    await Promise.all([one, two]);
    expect(mockSaveNotePatch.mock.calls.map((call) => call[2])).toEqual([{ content: 'old' }, { content: 'new' }]);
  });

  it('sends only the latest text when edits pile up before a save starts', async () => {
    mockSaveNotePatch.mockResolvedValue(undefined);
    noteSaves.schedule(client, 'n3', { content: 'a' }, 10_000);
    const one = noteSaves.flush(client, 'n3');
    noteSaves.schedule(client, 'n3', { content: 'ab' }, 10_000);
    await Promise.all([one, noteSaves.flush(client, 'n3')]);
    expect(mockSaveNotePatch.mock.calls.map((call) => call[2])).toEqual([{ content: 'ab' }]);
  });

  it('keeps the edits of a failed save, under the ones typed since, for the next try', async () => {
    mockSaveNotePatch.mockRejectedValueOnce(new Error('offline'));
    noteSaves.schedule(client, 'n2', { title: 'Título', content: 'antes' }, 10_000);
    await expect(noteSaves.flush(client, 'n2')).rejects.toThrow('offline');
    expect(noteSaves.isFailed('n2')).toBe(true);

    noteSaves.schedule(client, 'n2', { content: 'depois' }, 10_000);
    expect(noteSaves.unsaved('n2')).toEqual({ title: 'Título', content: 'depois' });

    mockSaveNotePatch.mockResolvedValueOnce(undefined);
    await noteSaves.flush(client, 'n2');
    expect(mockSaveNotePatch).toHaveBeenLastCalledWith(client, 'n2', { title: 'Título', content: 'depois' });
    expect(noteSaves.unsaved('n2')).toEqual({});
    expect(noteSaves.isFailed('n2')).toBe(false);
  });
});

describe('transcriptionQueue', () => {
  const segment = (segmentId: string) => ({
    segmentId,
    noteId: 'note-a',
    uri: `file:///${segmentId}.m4a`,
    mimeType: 'audio/m4a',
    recordedAt: '2026-11-21T10:00:00.000Z',
    durationMs: 30_000,
  });

  beforeEach(() => {
    mockTranscribe.mockReset();
    mockDeletedFiles.length = 0;
  });

  it('pauses on sign-out and never lets another account delete a recording', async () => {
    transcriptionQueue.setAccount('user-a');
    const pending = deferred();
    mockTranscribe.mockReturnValueOnce(pending.promise.then(() => Promise.reject(new ApiError(404, { error: 'not_found' }))));
    transcriptionQueue.enqueue(segment('s1'));
    await Promise.resolve();

    // user-a signs out and user-b signs in while the upload is in flight; the 404 is user-b's.
    transcriptionQueue.setAccount(null);
    transcriptionQueue.setAccount('user-b');
    pending.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockDeletedFiles).toEqual([]);
    expect(mockTranscribe).toHaveBeenCalledTimes(1);
    expect(transcriptionQueue.snapshot('note-a')).toEqual({ pending: 1, failed: 0 });

    // Back as user-a: it uploads and the file goes away.
    mockTranscribe.mockResolvedValueOnce({ segment: null });
    transcriptionQueue.setAccount('user-a');
    await transcriptionQueue.whenIdle('note-a');
    expect(mockDeletedFiles).toEqual(['file:///s1.m4a']);
  });

  it('records nothing while signed out', () => {
    transcriptionQueue.setAccount(null);
    transcriptionQueue.enqueue(segment('s2'));
    expect(transcriptionQueue.snapshot('note-a')).toEqual({ pending: 0, failed: 0 });
  });
});
