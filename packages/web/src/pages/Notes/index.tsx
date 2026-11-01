/**
 * Notes Page
 *
 * `/notes` lists notes; `/notes/:noteId` opens one (tab in `?tab=`).
 * One stable MainLayout render path, so opening/closing the chat never
 * remounts the editor. The recorder lives here (above MainLayout) because
 * both the ControlBar record slot and the note body read it; uploads and
 * automatic summaries are module-level and outlive this page.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMatch, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowsClockwise, NotePencil } from '@phosphor-icons/react';
import { MainLayout } from '../../components/layout';
import { MOBILE_BREAKPOINT } from '../../components/layout/MainLayout/MainLayout';
import { Sidebar } from '../../components/layout/Sidebar';
import { AIChatPanel } from '../../components/features/tasks/AIChatPanel';
import { Button, Loading, NewNoteIcon, Tooltip, type TaskCreationData } from '../../components/ui';
import { toast } from '../../components/ui/Sonner';
import {
  DeleteNoteDialog,
  NoteDetailView,
  type NoteSummaryAction,
  NoteEmptyState,
  NotesListView,
  RecordControl,
  closeNote,
  markNoteOpen,
  generateNoteSummary,
  useIsGeneratingSummary,
  getPreferredMicId,
  isRecordingSupported,
  noteRecorder,
  parseNoteTab,
  defaultNoteTab,
  scheduleAutoSummary,
  transcriptionQueue,
  useNoteRecorder,
  type NoteTab,
} from '../../components/features/notes';
import { SummaryIcon } from '../../components/features/notes/SummaryIcon';
import { useTasks, type Task } from '../../contexts/TaskContext';
import type { ChatAttachment } from '../../hooks/useChatStream';
import { useChatTaskSync } from '../../hooks/useChatTaskSync';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { isNotFoundError, removeNoteFromCache, useNote, useNoteMutations } from '../../hooks/useNotes';
import { notesApi } from '../../lib/notesApi';
import { captureProductEvent } from '../../lib/productAnalytics';
import styles from './Notes.module.css';

export function Notes() {
  const navigate = useNavigate();
  const match = useMatch('/notes/:noteId');
  const noteId = match?.params.noteId;
  const [searchParams, setSearchParams] = useSearchParams();

  const queryClient = useQueryClient();
  const { createTask } = useTasks();
  const { createNote } = useNoteMutations();
  const noteQuery = useNote(noteId);
  const note = noteQuery.data;
  const tab = parseNoteTab(searchParams.get('tab'), note ? defaultNoteTab(note) : 'notas');

  // Pin the opening tab in the URL so a summary generated while the note is
  // open doesn't move the user off Notas.
  const hasTabParam = searchParams.has('tab');
  const openedNoteId = note?.id;
  useEffect(() => {
    if (!openedNoteId || hasTabParam) return;
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set('tab', tab);
      return params;
    }, { replace: true });
  }, [openedNoteId, hasTabParam, tab, setSearchParams]);

  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);
  const isCompactHeader = useMediaQuery('(max-width: 824px)');
  const mainBodyRef = useRef<HTMLDivElement>(null);
  // The record control only renders in the ControlBar's prompt mode.
  const [controlBarMode, setControlBarMode] = useState<'prompt' | 'task'>('prompt');

  // ── Recorder ──────────────────────────────────────────────────────────────
  const recorder = useNoteRecorder();
  const [recordingSupported] = useState(isRecordingSupported);
  const [isPreparingRecording, setIsPreparingRecording] = useState(false);

  const startRecording = useCallback((targetNoteId: string) => {
    void noteRecorder.start({
      noteId: targetNoteId,
      deviceId: getPreferredMicId(),
      onSegment: (segment) => transcriptionQueue.enqueue(queryClient, segment),
      onFinished: (result) => {
        if (result.discarded || result.segments === 0) return;
        // Runs even if the user already left the page.
        void scheduleAutoSummary(queryClient, result.noteId, {
          shouldSkip: () => {
            const current = noteRecorder.getSnapshot();
            return current.status !== 'idle' && current.noteId === result.noteId;
          },
          onReady: () => {
            toast.success('Resumo pronto', {
              hasButton: true,
              duration: 6000,
              action: {
                label: 'Ver',
                onClick: () => navigate(`/notes/${result.noteId}?tab=resumo`),
              },
            });
          },
        });
      },
    });
  }, [queryClient, navigate]);

  const stopRecording = useCallback(() => noteRecorder.stop(), []);

  // Opening another note or the list stops the recording; the final segment
  // still goes to the note it was recorded for.
  useEffect(() => {
    const current = noteRecorder.getSnapshot();
    if (current.status !== 'idle' && current.noteId !== noteId) noteRecorder.stop();
  }, [noteId]);

  // Leaving the Notes page stops it too.
  useEffect(() => () => noteRecorder.stop(), []);

  const isRecorderActive = recorder.status !== 'idle';
  useEffect(() => {
    if (!isRecorderActive) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isRecorderActive]);

  // ── Create / open / delete ────────────────────────────────────────────────
  const [isCreatingNote, setIsCreatingNote] = useState(false);

  const handleCreateNote = useCallback(async () => {
    if (isCreatingNote) return;
    setIsCreatingNote(true);
    try {
      const created = await createNote();
      captureProductEvent('note_created', { source: 'button' });
      navigate(`/notes/${created.id}`);
    } catch (error) {
      console.error('Failed to create note:', error);
      toast.error('Não foi possível criar a nota.');
    } finally {
      setIsCreatingNote(false);
    }
  }, [isCreatingNote, createNote, navigate]);

  const handleRecordFromList = useCallback(async () => {
    if (isPreparingRecording) return;
    setIsPreparingRecording(true);
    try {
      const created = await createNote();
      captureProductEvent('note_created', { source: 'record' });
      navigate(`/notes/${created.id}`);
      startRecording(created.id);
    } catch (error) {
      console.error('Failed to create note for recording:', error);
      toast.error('Não foi possível criar a nota.');
    } finally {
      setIsPreparingRecording(false);
    }
  }, [isPreparingRecording, createNote, navigate, startRecording]);

  // Leaving a note with nothing in it deletes it (see emptyNoteCleanup).
  useEffect(() => {
    if (!noteId) return;
    markNoteOpen(noteId);
    return () => void closeNote(queryClient, noteId);
  }, [noteId, queryClient]);

  // ── "Gerar resumo" / "Atualizar resumo" (above the ControlBar) ────────────
  // Offered once the open note has notes or a transcript and no summary, or
  // has newer notes or transcript than its summary.
  const [summaryAction, setSummaryAction] = useState<NoteSummaryAction | null>(null);
  const isGeneratingSummary = useIsGeneratingSummary(noteId);

  const handleOpenNote = useCallback((id: string) => navigate(`/notes/${id}`), [navigate]);
  const handleBackToList = useCallback(() => navigate('/notes'), [navigate]);

  const handleTabChange = useCallback((next: NoteTab) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set('tab', next);
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirmDelete = useCallback(async () => {
    const id = deleteTargetId;
    if (!id || isDeleting) return;
    setIsDeleting(true);
    try {
      await notesApi.remove(id);
      const current = noteRecorder.getSnapshot();
      if (current.status !== 'idle' && current.noteId === id) noteRecorder.stop({ discard: true });
      transcriptionQueue.dropNote(id);
      setDeleteTargetId(null);
      if (noteId === id) navigate('/notes', { replace: true });
      // After the route change, so the open note's query does not refetch a 404.
      window.setTimeout(() => removeNoteFromCache(queryClient, id), 0);
      toast.success('Nota excluída');
    } catch (error) {
      console.error('Failed to delete note:', error);
      toast.error('Não foi possível excluir a nota.');
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTargetId, isDeleting, noteId, navigate, queryClient]);

  // ── ControlBar task creation (same mapping as Tasks) ──────────────────────
  const handleControlBarCreateTask = useCallback(async (taskData: TaskCreationData): Promise<Task | undefined> => {
    try {
      return await createTask({
        title: taskData.title,
        description: taskData.description || '',
        priority: taskData.priority,
        category: taskData.category || '',
        dueDate: taskData.dueDate || '',
        important: false,
        time: taskData.time || '',
        recurrence_type: taskData.recurrence_type,
        recurrence_config: taskData.recurrence_config,
        recurrence_until: taskData.recurrence_until,
        reminders: taskData.reminders,
      });
    } catch (error) {
      console.error('Failed to create task:', error);
      return undefined;
    }
  }, [createTask]);

  // ── Chat ──────────────────────────────────────────────────────────────────
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatKey, setChatKey] = useState(0);
  /** Note the chat was opened for (null = general chat from the list) */
  const [chatNoteId, setChatNoteId] = useState<string | null>(null);
  const [chatInitialMessage, setChatInitialMessage] = useState<string | undefined>(undefined);
  const [chatInitialAttachments, setChatInitialAttachments] = useState<ChatAttachment[] | undefined>(undefined);

  const handleOpenChat = useCallback((text?: string, attachments?: ChatAttachment[]) => {
    setChatNoteId(noteId ?? null);
    if (text || (attachments && attachments.length > 0)) {
      // Force a fresh panel so the initial message is always sent cleanly
      setChatKey((k) => k + 1);
      setChatInitialMessage(text);
      setChatInitialAttachments(attachments && attachments.length > 0 ? attachments : undefined);
    }
    setIsChatOpen(true);
  }, [noteId]);

  const handleCloseChat = useCallback(() => {
    setIsChatOpen(false);
    setChatInitialMessage(undefined);
    setChatInitialAttachments(undefined);
  }, []);

  // The chat is about one note (or the list): close it when that context changes.
  useEffect(() => {
    if (isChatOpen && chatNoteId !== (noteId ?? null)) handleCloseChat();
    // Only react to navigation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  // AI task descriptions and the files sent with a message (as on Tasks)
  const { onTaskMutated: handleChatTaskMutated, onAttachmentsSent: handleChatAttachmentsSent } =
    useChatTaskSync();

  const chatPanel = isChatOpen ? (
    <div className={styles.chatPanel}>
      <AIChatPanel
        key={chatKey}
        mode={chatNoteId ? 'note' : 'general'}
        noteId={chatNoteId ?? undefined}
        onClose={handleCloseChat}
        onTaskMutated={handleChatTaskMutated}
        onAttachmentsSent={handleChatAttachmentsSent}
        initialMessage={chatInitialMessage}
        initialAttachments={chatInitialAttachments}
      />
    </div>
  ) : undefined;

  // ── Record control (ControlBar leading slot) ──────────────────────────────
  let recordDisabledReason: string | undefined;
  if (noteId && !note) {
    recordDisabledReason = noteQuery.isError ? 'Nota não encontrada.' : 'Carregando nota…';
  } else if (note?.access_level === 'read') {
    recordDisabledReason = 'Você só tem acesso de leitura a esta nota.';
  }

  const recordControl = (
    <RecordControl
      status={recorder.status}
      startedAt={recorder.startedAt}
      supported={recordingSupported}
      isPreparing={isPreparingRecording}
      disabledReason={recordDisabledReason}
      onStart={() => {
        if (noteId) startRecording(noteId);
        else void handleRecordFromList();
      }}
      onStop={stopRecording}
    />
  );

  // ── Body ──────────────────────────────────────────────────────────────────
  const newNoteLabel = 'Nova nota';
  const headerActions = noteId ? undefined : (
    <Tooltip label={newNoteLabel} position="bottom" disabled={!isCompactHeader}>
      <Button
        variant="secondary"
        size="medium"
        icon={NewNoteIcon}
        iconPosition={isCompactHeader ? 'icon-only' : 'left'}
        aria-label={isCompactHeader ? newNoteLabel : undefined}
        loading={isCreatingNote}
        onClick={() => void handleCreateNote()}
      >
        {!isCompactHeader && newNoteLabel}
      </Button>
    </Tooltip>
  );

  const generateSummaryAction = noteId && summaryAction && tab !== 'resumo' ? (
    <Button
      variant="secondary"
      size="medium"
      icon={summaryAction === 'update' ? ArrowsClockwise : SummaryIcon}
      iconPosition="left"
      loading={isGeneratingSummary}
      onClick={() => {
        void generateNoteSummary(queryClient, noteId, 'manual');
        handleTabChange('resumo');
      }}
    >
      {summaryAction === 'update' ? 'Atualizar resumo' : 'Gerar resumo'}
    </Button>
  ) : null;

  const renderDetail = () => {
    if (note) {
      return (
        <NoteDetailView
          key={note.id}
          note={note}
          tab={tab}
          onTabChange={handleTabChange}
          onBack={handleBackToList}
          onRequestDelete={() => setDeleteTargetId(note.id)}
          isControlBarHidden={isChatOpen || isMobile || controlBarMode === 'task'}
          recordingSupported={recordingSupported}
          onStartRecording={() => startRecording(note.id)}
          onSummaryActionChange={setSummaryAction}
        />
      );
    }
    if (noteQuery.isError && isNotFoundError(noteQuery.error)) {
      return (
        <NoteEmptyState
          icon={NotePencil}
          title="Nota não encontrada"
          description="Ela pode ter sido excluída ou você não tem mais acesso."
          action={
            <Button variant="secondary" onClick={handleBackToList}>
              Voltar para notas
            </Button>
          }
        />
      );
    }
    if (noteQuery.isError) {
      return (
        <div className={styles.errorState}>
          <p className={styles.errorText}>Não foi possível carregar a nota.</p>
          <Button
            variant="secondary"
            loading={noteQuery.isFetching}
            onClick={() => void noteQuery.refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      );
    }
    return <Loading centered size="lg" />;
  };

  return (
    <>
      <MainLayout
        sidebar={<Sidebar selectedList={null} forceCollapsed={isChatOpen} />}
        title={noteId ? note?.title.trim() || 'Nova nota' : 'Notas'}
        titleVariant="heading"
        headerActions={headerActions}
        hideHeader={!!noteId}
        // The note view is its own scroll area, with faded edges
        scrollableBody={!(noteId && note)}
        onCreateTask={handleControlBarCreateTask}
        onOpenChat={handleOpenChat}
        onSubmitPrompt={handleOpenChat}
        hideControlBar={isChatOpen}
        rightSidebar={chatPanel}
        rightSidebarAsSheet={isChatOpen}
        onRightSidebarClose={handleCloseChat}
        controlBarLeading={recordControl}
        controlBarAbove={generateSummaryAction}
        onControlBarModeChange={setControlBarMode}
        controlBarPlaceholder={noteId ? 'Pergunte algo sobre esta nota…' : undefined}
        mainBodyRef={mainBodyRef}
      >
        {noteId ? (
          renderDetail()
        ) : (
          <NotesListView
            onOpenNote={handleOpenNote}
            onCreateNote={() => void handleCreateNote()}
            isCreating={isCreatingNote}
            onRequestDelete={setDeleteTargetId}
          />
        )}
      </MainLayout>

      <DeleteNoteDialog
        isOpen={deleteTargetId !== null}
        isDeleting={isDeleting}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </>
  );
}
