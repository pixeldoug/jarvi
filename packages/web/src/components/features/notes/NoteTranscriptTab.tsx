/**
 * NoteTranscriptTab — consent notice, mic picker, audio file upload and the
 * live transcript.
 */

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { Microphone, UploadSimple } from '@phosphor-icons/react';
import type { RecorderStatus } from './useNoteRecorder';
import { Button, Tooltip } from '../../ui';
import type { NoteTranscriptSegment } from '../../../lib/notesApi';
import { MicPicker } from './MicPicker';
import { AUDIO_IMPORT_ACCEPT, AUDIO_IMPORT_HINT, type AudioImportState } from './audioFileImport';
import microphoneIllustration from '../../../assets/illustrations/microphone.webp';
import microphoneIllustration2x from '../../../assets/illustrations/microphone@2x.webp';
import { NoteEmptyState, type NoteEmptyStateIllustration } from './NoteEmptyState';
import { formatClock } from './noteText';
import styles from './NoteTranscriptTab.module.css';

const MICROPHONE_ILLUSTRATION: NoteEmptyStateIllustration = {
  src: microphoneIllustration,
  src2x: microphoneIllustration2x,
  width: 64,
  height: 96,
};

/** Distance from the bottom (px) that still counts as "following" the transcript. */
const FOLLOW_THRESHOLD_PX = 160;

/**
 * The element that actually scrolls: MainLayout's body on desktop, the
 * document on mobile (there the body grows with its content).
 */
function getScroller(container: HTMLElement | null): HTMLElement | null {
  if (container && container.scrollHeight > container.clientHeight + 1) return container;
  return (document.scrollingElement as HTMLElement | null) ?? container;
}

export interface NoteTranscriptTabProps {
  segments: NoteTranscriptSegment[];
  /** The microphone is capturing audio for this note */
  isListening: boolean;
  /** Segments of this note still uploading / transcribing */
  pendingUploads: number;
  canRecord: boolean;
  /** Browser can capture the microphone (the "Gravar" shortcut says why not) */
  recordingSupported: boolean;
  /** Recorder state for this note (the shortcut shows a spinner while asking) */
  recorderStatus: RecorderStatus;
  /** Same action as the ControlBar's "Gravar" */
  onStartRecording: () => void;
  /** The page's scroll container (MainLayout body) */
  scrollContainerRef: RefObject<HTMLDivElement>;
  /** Can add audio files (write access) */
  canImportAudio: boolean;
  /** Upload is unavailable right now (e.g. recording) — shown as the reason */
  importDisabledReason?: string;
  /** File import running for this note */
  audioImport: AudioImportState | null;
  onImportAudio: (file: File) => void;
  onCancelImport: () => void;
}

export function NoteTranscriptTab({
  segments,
  isListening,
  pendingUploads,
  canRecord,
  recordingSupported,
  recorderStatus,
  onStartRecording,
  scrollContainerRef,
  canImportAudio,
  importDisabledReason,
  audioImport,
  onImportAudio,
  onCancelImport,
}: NoteTranscriptTabProps) {
  const isFollowingRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  let statusLabel: string | null = null;
  if (audioImport?.phase === 'decoding') {
    statusLabel = 'Lendo o arquivo…';
  } else if (audioImport) {
    const done = Math.max(audioImport.sentChunks - pendingUploads, 0);
    statusLabel = `Transcrevendo o arquivo… ${done} de ${audioImport.totalChunks}`;
  } else if (pendingUploads > 0) {
    statusLabel = 'Transcrevendo…';
  } else if (isListening) {
    statusLabel = 'Ouvindo…';
  }

  const importDisabled = !!importDisabledReason || !!audioImport;
  const openFilePicker = () => fileInputRef.current?.click();
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // the same file can be picked again
    if (file) onImportAudio(file);
  };

  // Track whether the user sits near the bottom of the page. Document
  // scrolling fires on window, so listen there too.
  useEffect(() => {
    const container = scrollContainerRef.current;
    const update = () => {
      const scroller = getScroller(scrollContainerRef.current);
      if (!scroller) return;
      const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      isFollowingRef.current = distance < FOLLOW_THRESHOLD_PX;
    };
    update();
    container?.addEventListener('scroll', update, { passive: true });
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      container?.removeEventListener('scroll', update);
      window.removeEventListener('scroll', update);
    };
  }, [scrollContainerRef]);

  // Opening the tab mid-recording jumps to the latest text.
  useLayoutEffect(() => {
    const scroller = getScroller(scrollContainerRef.current);
    if (!scroller || !isListening) return;
    scroller.scrollTop = scroller.scrollHeight;
    isFollowingRef.current = true;
    // Only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the newest segment in view while the user is following along. Only
  // when a segment or the status actually changes: opening the tab (and
  // StrictMode's effect replay) must not move the header — the mid-recording
  // jump above covers that case.
  const followedRef = useRef({ count: segments.length, status: statusLabel });
  useEffect(() => {
    const followed = followedRef.current;
    if (followed.count === segments.length && followed.status === statusLabel) return;
    followedRef.current = { count: segments.length, status: statusLabel };
    const scroller = getScroller(scrollContainerRef.current);
    if (!scroller || !isFollowingRef.current) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
  }, [segments.length, statusLabel, scrollContainerRef]);

  const isEmpty = segments.length === 0 && !statusLabel;

  const uploadButton = (compact: boolean) => {
    const button = (
      <Button
        variant={compact ? 'ghost' : 'secondary'}
        size={compact ? 'small' : 'medium'}
        icon={UploadSimple}
        iconPosition="left"
        disabled={importDisabled}
        onClick={openFilePicker}
      >
        Enviar áudio
      </Button>
    );
    return importDisabledReason ? (
      <Tooltip label={importDisabledReason} position="top">
        {button}
      </Tooltip>
    ) : (
      button
    );
  };

  // Empty-state shortcut to the ControlBar's "Gravar" (same recorder, so the
  // bar switches to "Parar" too).
  const recordShortcut = (() => {
    const button = (
      <Button
        variant="primary"
        size="medium"
        icon={Microphone}
        iconPosition="left"
        loading={recorderStatus === 'requesting'}
        disabled={!canRecord || recorderStatus !== 'idle' || !!audioImport}
        onClick={onStartRecording}
      >
        Gravar
      </Button>
    );
    return recordingSupported ? (
      button
    ) : (
      <Tooltip label="Seu navegador não permite gravar áudio aqui." position="top">
        {button}
      </Tooltip>
    );
  })();

  return (
    <div className={styles.transcript}>
      {canImportAudio && (
        <input
          ref={fileInputRef}
          type="file"
          accept={AUDIO_IMPORT_ACCEPT}
          className={styles.fileInput}
          onChange={handleFileChange}
          tabIndex={-1}
          aria-hidden="true"
        />
      )}

      <div className={styles.topRow}>
        <p className={styles.consent}>Sempre peça consentimento antes de gravar outras pessoas.</p>
        <div className={styles.topActions}>
          {canImportAudio && !isEmpty && uploadButton(true)}
          {canRecord && <MicPicker />}
        </div>
      </div>

      {isEmpty ? (
        <NoteEmptyState
          compact
          icon={Microphone}
          illustration={MICROPHONE_ILLUSTRATION}
          description={
            canImportAudio
              ? 'Comece a gravar ou envie um áudio para ver a transcrição aqui.'
              : 'Comece a gravar para ver a transcrição aqui.'
          }
          action={
            canImportAudio ? (
              <>
                {recordShortcut}
                {uploadButton(false)}
              </>
            ) : undefined
          }
          helper={canImportAudio ? importDisabledReason ?? AUDIO_IMPORT_HINT : undefined}
        />
      ) : (
        <ol className={styles.segments}>
          {segments.map((segment) => (
            <li key={segment.id} className={styles.segment}>
              <time className={styles.time} dateTime={segment.recorded_at}>
                {formatClock(segment.recorded_at)}
              </time>
              <p className={styles.text}>{segment.text}</p>
            </li>
          ))}
          {statusLabel && (
            <li className={styles.status} aria-live="polite">
              <span className={styles.statusDot} aria-hidden="true" />
              {statusLabel}
              {audioImport && audioImport.sentChunks < audioImport.totalChunks && (
                <Button variant="ghost" size="small" onClick={onCancelImport}>
                  Cancelar
                </Button>
              )}
            </li>
          )}
        </ol>
      )}
    </div>
  );
}
