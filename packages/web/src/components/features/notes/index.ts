/**
 * Notes feature — list, note detail (notes / summary / transcript),
 * microphone recording and transcription upload.
 */

export { NotesListView, type NotesListViewProps } from './NotesListView';
export { NoteDetailView, type NoteDetailViewProps, type NoteSummaryAction } from './NoteDetailView';
export { NoteHeader, NoteTopBar, type NoteHeaderProps, type NoteTopBarProps } from './NoteHeader';
export { NoteTabs, type NoteTabsProps } from './NoteTabs';
export { NoteNotesTab, type NoteNotesTabProps } from './NoteNotesTab';
export { NoteSummaryTab, type NoteSummaryTabProps, type SummaryNextStepsState } from './NoteSummaryTab';
export { ConvertToTasksDialog, type ConvertToTasksDialogProps } from './ConvertToTasksDialog';
export {
  parseSummaryTasks,
  linkSummaryTasks,
  setSummaryTaskChecked,
  diffLinkedChecked,
  diffLinkedCheckedItems,
  listStepReviews,
  type SummaryStepReview,
  type SummaryTaskItem,
  type SummaryTaskLink,
  type SummaryTaskCheckChange,
} from './summaryTasks';
export { StepReviewDialog, type StepReviewDialogProps } from './StepReviewDialog';
export { NoteTranscriptTab, type NoteTranscriptTabProps } from './NoteTranscriptTab';
export { NoteEmptyState, type NoteEmptyStateProps } from './NoteEmptyState';
export { NoteActionsMenu, type NoteActionsMenuProps, type NoteActionsMenuItem } from './NoteActionsMenu';
export { DeleteNoteDialog, type DeleteNoteDialogProps } from './DeleteNoteDialog';
export { RecordControl, type RecordControlProps } from './RecordControl';
export { RecordingChip } from './RecordingChip';
export { MicPicker } from './MicPicker';
export {
  noteRecorder,
  useNoteRecorder,
  isRecordingSupported,
  formatElapsed,
  type RecorderStatus,
  type RecorderSnapshot,
  type CapturedSegment,
  type RecordingResult,
  type StartRecordingOptions,
} from './useNoteRecorder';
export { transcriptionQueue, usePendingTranscriptions, type TranscriptionJob } from './transcriptionQueue';
export {
  generateNoteSummary,
  scheduleAutoSummary,
  useIsGeneratingSummary,
  type SummarySource,
} from './summaryGeneration';
export { useNoteAutosave, flushNoteSaves, type NoteAutosave } from './noteAutosave';
export { closeNote, isNoteEmpty, markNoteOpen } from './emptyNoteCleanup';
export { getPreferredMicId, setPreferredMicId, usePreferredMicId } from './micPreference';
export { NOTE_TABS, parseNoteTab, defaultNoteTab, type NoteTab } from './noteTabConfig';
export {
  docToPlainText,
  isDocEmpty,
  transcriptToPlainText,
  formatClock,
  formatDateChip,
  formatRelativeTime,
} from './noteText';
