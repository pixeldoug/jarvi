/**
 * NoteDetailView — one note: header, tabs + date chip, and the tab body.
 *
 * Render it with `key={note.id}`: local drafts (title, notes, summary) are
 * initialised once per note and never overwritten from the server while the
 * user edits. Autosave flushes on blur, tab switch and unmount.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion, type Variants } from 'motion/react';
import { toast } from '../../ui';
import { useNoteMutations } from '../../../hooks/useNotes';
import type { NoteDetail } from '../../../lib/notesApi';
import { ConvertToTasksDialog } from './ConvertToTasksDialog';
import { NoteCategoryControl } from './NoteCategoryControl';
import { NoteDateControl } from './NoteDateControl';
import { NoteHeader, NoteTopBar } from './NoteHeader';
import { NoteTabs } from './NoteTabs';
import { NoteNotesTab } from './NoteNotesTab';
import { NoteSummaryTab } from './NoteSummaryTab';
import { NoteTranscriptTab } from './NoteTranscriptTab';
import { RecordingChip } from './RecordingChip';
import { useNoteAutosave } from './noteAutosave';
import { generateNoteSummary, scheduleAutoSummary, useIsGeneratingSummary } from './summaryGeneration';
import {
  AudioImportError,
  audioFileImport,
  useAudioImport,
  useIsImportingAudio,
  type AudioImportResult,
} from './audioFileImport';
import { transcriptionQueue, usePendingTranscriptions } from './transcriptionQueue';
import { useNoteRecorder } from './useNoteRecorder';
import { useScrollFade } from './useScrollFade';
import { useSummaryTasks } from './useSummaryTasks';
import { StepReviewDialog } from './StepReviewDialog';
import {
  joinNextStepsSection,
  removeSummaryStep,
  splitNextStepsSection,
  updateSummaryStep,
  type SummaryStepPatch,
} from './summaryTasks';
import {
  NOTE_TAB_TRANSITION,
  noteTabId,
  noteTabIndex,
  noteTabPanelId,
  type NoteTab,
} from './noteTabConfig';
import { docToPlainText, isDocEmpty, notesFingerprint, transcriptToPlainText } from './noteText';
import styles from './NoteDetailView.module.css';

const TITLE_SAVE_DELAY_MS = 600;
const CONTENT_SAVE_DELAY_MS = 1000;

/**
 * Tab content slides like a carousel (custom = -1 | 0 | 1): the new tab comes
 * in from the side of the tab picked while the old one leaves the other way,
 * at the same time (`popLayout`), so the swap never waits on the exit.
 */
const PANEL_OFFSET_PX = 32;
const panelVariants: Variants = {
  enter: (direction: number) => ({ x: direction * PANEL_OFFSET_PX, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: NOTE_TAB_TRANSITION },
  exit: (direction: number) => ({
    x: direction * -PANEL_OFFSET_PX,
    opacity: 0,
    transition: NOTE_TAB_TRANSITION,
  }),
};

/**
 * An imported file is fully transcribed: generate the summary. Some chunks
 * failed for good: say so and offer to send them again, rather than
 * summarizing a transcript with holes.
 */
function finishAudioImport(
  queryClient: QueryClient,
  noteId: string,
  failedChunks: number,
  totalChunks: number,
  onSummaryReady: () => void,
): void {
  if (failedChunks > 0) {
    toast.error(
      failedChunks >= totalChunks
        ? 'Não foi possível transcrever o áudio.'
        : `${failedChunks} de ${totalChunks} trechos do áudio não foram transcritos. O resumo não foi gerado.`,
      {
        hasButton: true,
        duration: 15_000,
        action: {
          label: 'Tentar de novo',
          onClick: () => {
            transcriptionQueue.retryFailed(noteId);
            void transcriptionQueue.whenIdle(noteId).then(() => {
              finishAudioImport(
                queryClient,
                noteId,
                transcriptionQueue.failedCount(noteId),
                totalChunks,
                onSummaryReady,
              );
            });
          },
        },
      },
    );
    return;
  }
  void scheduleAutoSummary(queryClient, noteId, {
    shouldSkip: () => {
      const current = audioFileImport.getSnapshot();
      return current !== null && current.noteId === noteId;
    },
    onReady: onSummaryReady,
  });
}

export interface NoteDetailViewProps {
  note: NoteDetail;
  tab: NoteTab;
  onTabChange: (tab: NoteTab) => void;
  onBack: () => void;
  onRequestDelete: () => void;
  /** The ControlBar (with the record control) is not visible right now */
  isControlBarHidden: boolean;
  recordingSupported: boolean;
  /** Same action as the ControlBar's "Gravar" (shortcut in the transcript tab) */
  onStartRecording: () => void;
  /**
   * What the page offers above the ControlBar: `generate` (notes or a
   * transcript, no summary yet), `update` (the summary misses newer notes or
   * transcript) or null
   */
  onSummaryActionChange?: (action: NoteSummaryAction | null) => void;
}

export type NoteSummaryAction = 'generate' | 'update';

export function NoteDetailView({
  note,
  tab,
  onTabChange,
  onBack,
  onRequestDelete,
  isControlBarHidden,
  recordingSupported,
  onStartRecording,
  onSummaryActionChange,
}: NoteDetailViewProps) {
  const queryClient = useQueryClient();
  const { schedule, flush, isPending } = useNoteAutosave(note.id);
  const recorder = useNoteRecorder();
  const pendingUploads = usePendingTranscriptions(note.id);
  const isGenerating = useIsGeneratingSummary(note.id);
  const audioImport = useAudioImport(note.id);
  const isImportingAnyAudio = useIsImportingAudio();
  const navigate = useNavigate();
  // The whole view scrolls inside the card, with faded edges (see CSS).
  const scrollerRef = useRef<HTMLDivElement>(null);
  useScrollFade(scrollerRef);

  const canEdit = note.access_level !== 'read';
  const isOwner = note.access_level === 'owner';

  // ── Local drafts ────────────────────────────────────────────────────────────
  const [title, setTitle] = useState(note.title);
  const titleRef = useRef(title);
  titleRef.current = title;

  // Notes/summary drafts live in refs: the editors own their state and the
  // page must not re-render on every keystroke. Read on (re)mount only.
  const notesDraftRef = useRef(note.content);
  const summaryDraftRef = useRef<{ version: string | null; value: string } | null>(null);
  const [isNewNote] = useState(
    () => !note.title.trim() && isDocEmpty(note.content) && note.segments.length === 0,
  );

  // The notes say something the summary has not read: their fingerprint differs
  // from the one stored when it was generated. A summary from before
  // fingerprints is compared with the notes as this view opened them (it
  // existed already, so anything typed since is news).
  // State, not render math: typing re-renders only when the answer flips.
  const [openedNotesFingerprint] = useState(() => notesFingerprint(note.content));
  const summarySourceRef = useRef({ summary: note.summary, fingerprint: note.summary_notes_fingerprint });
  summarySourceRef.current = { summary: note.summary, fingerprint: note.summary_notes_fingerprint };
  const notesDifferFromSummary = useCallback((json: string) => {
    const { summary, fingerprint } = summarySourceRef.current;
    return !!summary && notesFingerprint(json) !== (fingerprint ?? openedNotesFingerprint);
  }, [openedNotesFingerprint]);
  const [notesChangedSinceSummary, setNotesChangedSinceSummary] = useState(() =>
    notesDifferFromSummary(note.content),
  );
  useEffect(() => {
    setNotesChangedSinceSummary(notesDifferFromSummary(notesDraftRef.current));
  }, [note.summary, note.summary_notes_fingerprint, notesDifferFromSummary]);

  // A generated summary may come with an AI title (only when ours was empty).
  const summaryVersionRef = useRef(note.summary_updated_at);
  useEffect(() => {
    if (note.summary_updated_at === summaryVersionRef.current) return;
    summaryVersionRef.current = note.summary_updated_at;
    if (!titleRef.current.trim() && note.title.trim() && !isPending('title')) {
      setTitle(note.title);
    }
  }, [note.summary_updated_at, note.title, isPending]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleTitleChange = useCallback((value: string) => {
    setTitle(value);
    schedule({ title: value }, TITLE_SAVE_DELAY_MS);
  }, [schedule]);

  // Re-renders only when the notes go from empty to not (or back).
  const [hasNotesText, setHasNotesText] = useState(() => !isDocEmpty(note.content));

  const handleNotesChange = useCallback((json: string) => {
    notesDraftRef.current = json;
    setHasNotesText(!isDocEmpty(json));
    setNotesChangedSinceSummary(notesDifferFromSummary(json));
    schedule({ content: json }, CONTENT_SAVE_DELAY_MS);
  }, [schedule, notesDifferFromSummary]);

  const summaryVersion = note.summary_updated_at;
  const noteRef = useRef(note);
  noteRef.current = note;

  /** Latest summary: the draft typed on the current version, else the server value. */
  const readSummary = useCallback((): string | null => {
    const draft = summaryDraftRef.current;
    const current = noteRef.current;
    return draft && draft.version === current.summary_updated_at ? draft.value : current.summary;
  }, []);

  /** Programmatic summary change (linked tasks): becomes the draft and gets saved. */
  const setSummary = useCallback((json: string) => {
    summaryDraftRef.current = { version: noteRef.current.summary_updated_at, value: json };
    schedule({ summary: json }, CONTENT_SAVE_DELAY_MS);
  }, [schedule]);

  const summaryContent = readSummary();
  const summaryTasks = useSummaryTasks({
    noteId: note.id,
    summary: summaryContent,
    isEditorActive: tab === 'resumo' && canEdit && !isGenerating && !!summaryContent,
    readSummary,
    setSummary,
    flush,
  });
  const { trackSummaryChange } = summaryTasks;

  // The editor edits the summary without "Próximos passos" (shown as a task
  // list): put the latest section back before saving.
  const handleSummaryChange = useCallback((body: string) => {
    const json = joinNextStepsSection(body, splitNextStepsSection(readSummary())?.section ?? []);
    summaryDraftRef.current = { version: summaryVersion, value: json };
    schedule({ summary: json }, CONTENT_SAVE_DELAY_MS);
    trackSummaryChange(json);
  }, [schedule, summaryVersion, trackSummaryChange, readSummary]);

  // A step that is not a task yet is edited from its row in the list (done,
  // date, category, text, delete): saved in the summary, and the list redraws.
  const [, redrawSteps] = useReducer((n: number) => n + 1, 0);
  const handleUpdateStep = useCallback((stepId: string, patch: SummaryStepPatch) => {
    const current = readSummary();
    if (!current) return;
    const next = updateSummaryStep(current, stepId, patch);
    if (next === current) return;
    setSummary(next);
    redrawSteps();
  }, [readSummary, setSummary]);
  const handleRemoveStep = useCallback((stepId: string) => {
    const current = readSummary();
    if (!current) return;
    const next = removeSummaryStep(current, stepId);
    if (next === current) return;
    setSummary(next);
    redrawSteps();
  }, [readSummary, setSummary]);

  const handleFlush = useCallback(() => {
    void flush();
  }, [flush]);

  const { setNotePinned } = useNoteMutations();
  const handleTogglePin = useCallback(() => {
    const pinned = !!note.pinned_at;
    setNotePinned(note.id, !pinned).catch((error) => {
      console.error('Failed to pin note:', error);
      toast.error(pinned ? 'Não foi possível desafixar a nota.' : 'Não foi possível fixar a nota.');
    });
  }, [note.id, note.pinned_at, setNotePinned]);

  const handleTabChange = useCallback((next: NoteTab) => {
    void flush();
    onTabChange(next);
  }, [flush, onTabChange]);

  const handleGenerate = useCallback(() => {
    // generateNoteSummary flushes this note's pending saves first.
    void generateNoteSummary(queryClient, note.id, 'manual');
  }, [queryClient, note.id]);

  const copyText = useCallback(
    (what: NoteTab) =>
      what === 'notas'
        ? docToPlainText(notesDraftRef.current)
        : what === 'resumo'
          ? docToPlainText(summaryContent)
          : transcriptToPlainText(note.segments),
    [summaryContent, note.segments],
  );
  const canCopy = useCallback((what: NoteTab) => copyText(what) !== '', [copyText]);

  const handleCopy = useCallback(async (what: NoteTab) => {
    const text = copyText(what);
    if (!text) {
      toast.info('Nada para copiar.');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copiado');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  }, [copyText]);

  // ── Audio file import ───────────────────────────────────────────────────────
  // Same pipeline as a recording: the chunks go through the transcription
  // queue, then the summary is generated if the note has none yet.
  const handleImportAudio = useCallback(async (file: File) => {
    const noteId = note.id;
    let result: AudioImportResult;
    try {
      result = await audioFileImport.start(queryClient, noteId, file);
    } catch (error) {
      toast.error(
        error instanceof AudioImportError ? error.message : 'Não foi possível transcrever o arquivo.',
      );
      return;
    }
    if (result.cancelled) {
      toast.info('Envio do arquivo cancelado.');
      return;
    }
    finishAudioImport(queryClient, noteId, result.failedChunks, result.totalChunks, () => {
      toast.success('Resumo pronto', {
        hasButton: true,
        duration: 6000,
        action: { label: 'Ver', onClick: () => navigate(`/notes/${noteId}?tab=resumo`) },
      });
    });
  }, [note.id, queryClient, navigate]);

  // ── Derived state ───────────────────────────────────────────────────────────
  const isListening = recorder.noteId === note.id && recorder.status === 'recording';

  // Slide direction of the last tab change: right (1) when moving to a later
  // tab, left (-1) to an earlier one. Updated during render so the entering
  // and exiting panels read it in the same commit.
  const prevTabRef = useRef(tab);
  const tabDirectionRef = useRef(0);
  if (prevTabRef.current !== tab) {
    tabDirectionRef.current = noteTabIndex(tab) > noteTabIndex(prevTabRef.current) ? 1 : -1;
    prevTabRef.current = tab;
  }
  const tabDirection = tabDirectionRef.current;
  const hasTranscriptText = note.segments.some((segment) => segment.text.trim() !== '');
  const hasSource = hasTranscriptText || hasNotesText;
  const summaryTime = summaryVersion ? Date.parse(summaryVersion) : NaN;
  const hasNewTranscript =
    !!note.summary &&
    !Number.isNaN(summaryTime) &&
    note.segments.some((segment) => Date.parse(segment.created_at) > summaryTime);
  const summaryAction: NoteSummaryAction | null =
    !canEdit || !hasSource || isListening
      ? null
      : !note.summary
        ? 'generate'
        : notesChangedSinceSummary || hasNewTranscript
          ? 'update'
          : null;
  useEffect(() => {
    onSummaryActionChange?.(summaryAction);
  }, [summaryAction, onSummaryActionChange]);
  useEffect(() => () => onSummaryActionChange?.(null), [onSummaryActionChange]);

  return (
    <div className={styles.page} ref={scrollerRef}>
      <NoteTopBar
        onBack={onBack}
        copy={{ canCopy, onCopy: (what) => void handleCopy(what) }}
        pinned={!!note.pinned_at}
        onTogglePin={handleTogglePin}
        onRequestDelete={isOwner ? onRequestDelete : undefined}
      />

      <div className={styles.column}>
        <NoteHeader
          title={title}
          onTitleChange={handleTitleChange}
          onTitleBlur={handleFlush}
          readOnly={!canEdit}
        />

        <div className={styles.toolbar}>
          <NoteTabs value={tab} onChange={handleTabChange} />
          <div className={styles.chips}>
            <NoteDateControl note={note} readOnly={!canEdit} />
            {/* The category is the owner's (their categories) */}
            {isOwner && <NoteCategoryControl noteId={note.id} category={note.category} />}
          </div>
          {isListening && isControlBarHidden && <RecordingChip startedAt={recorder.startedAt} />}
        </div>
      </div>

      <div
        className={`${styles.column} ${styles.panel}`}
        role="tabpanel"
        id={noteTabPanelId(tab)}
        aria-labelledby={noteTabId(tab)}
      >
        <MotionConfig reducedMotion="user">
          <AnimatePresence mode="popLayout" initial={false} custom={tabDirection}>
            <motion.div
              key={tab}
              className={styles.panelContent}
              custom={tabDirection}
              variants={panelVariants}
              initial="enter"
              animate="center"
              exit="exit"
            >
              {tab === 'notas' && (
                <NoteNotesTab
                  noteId={note.id}
                  content={notesDraftRef.current}
                  readOnly={!canEdit}
                  autoFocus={isNewNote && isDocEmpty(notesDraftRef.current)}
                  onChange={handleNotesChange}
                  onBlur={handleFlush}
                />
              )}

              {tab === 'resumo' && (
                <NoteSummaryTab
                  summary={summaryContent}
                  summaryVersion={summaryVersion}
                  editorKey={`${summaryVersion ?? 'summary'}:${summaryTasks.editorEpoch}`}
                  isGenerating={isGenerating}
                  canEdit={canEdit}
                  hasSource={hasSource}
                  newSince={{ notes: notesChangedSinceSummary, transcript: hasNewTranscript }}
                  nextSteps={summaryTasks.nextSteps}
                  prepareContent={canEdit && !isGenerating ? summaryTasks.reconcile : undefined}
                  onGenerate={handleGenerate}
                  onCreateTasks={summaryTasks.openDialog}
                  onUpdateStep={handleUpdateStep}
                  onRemoveStep={handleRemoveStep}
                  onOpenTask={summaryTasks.openTask}
                  reviewCount={summaryTasks.reviews.length}
                  onReviewStep={summaryTasks.openReview}
                  onSummaryChange={handleSummaryChange}
                  onSummaryBlur={handleFlush}
                />
              )}

              {tab === 'transcricao' && (
                <NoteTranscriptTab
                  segments={note.segments}
                  isListening={isListening}
                  pendingUploads={pendingUploads}
                  canRecord={canEdit && recordingSupported}
                  recordingSupported={recordingSupported}
                  recorderStatus={recorder.noteId === note.id ? recorder.status : 'idle'}
                  onStartRecording={onStartRecording}
                  scrollContainerRef={scrollerRef}
                  canImportAudio={canEdit}
                  importDisabledReason={
                    recorder.status !== 'idle'
                      ? 'Pare a gravação para enviar um arquivo.'
                      : isImportingAnyAudio && !audioImport
                        ? 'Já tem um arquivo sendo transcrito em outra nota.'
                        : undefined
                  }
                  audioImport={audioImport}
                  onImportAudio={(file) => void handleImportAudio(file)}
                  onCancelImport={audioFileImport.cancel}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </MotionConfig>
      </div>

      <ConvertToTasksDialog
        isOpen={summaryTasks.dialogItems !== null}
        items={summaryTasks.dialogItems ?? []}
        isCreating={summaryTasks.isCreating}
        onClose={summaryTasks.closeDialog}
        onConfirm={(items) => void summaryTasks.createTasks(items)}
      />

      <StepReviewDialog
        review={summaryTasks.reviewing}
        resolving={summaryTasks.resolving}
        onClose={summaryTasks.closeReview}
        onResolve={(decision) => void summaryTasks.resolveReview(decision)}
      />
    </div>
  );
}
