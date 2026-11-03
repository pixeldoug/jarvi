import { Subtitles, type Icon } from '@phosphor-icons/react';
import { NoteIcon } from '../../ui';
import { SEGMENTED_CONTROL_TRANSITION } from '../../ui/SegmentedControl';
import { SummaryIcon } from './SummaryIcon';

export type NoteTab = 'notas' | 'resumo' | 'transcricao';

export const NOTE_TABS: Array<{ id: NoteTab; label: string; icon: Icon }> = [
  { id: 'resumo', label: 'Resumo', icon: SummaryIcon },
  { id: 'notas', label: 'Notas', icon: NoteIcon },
  { id: 'transcricao', label: 'Transcrição', icon: Subtitles },
];

export function parseNoteTab(value: string | null | undefined, fallback: NoteTab = 'notas'): NoteTab {
  return value === 'notas' || value === 'resumo' || value === 'transcricao' ? value : fallback;
}

/** Tab a note opens on without `?tab=`: Resumo once it has a summary, else Notas */
export function defaultNoteTab(note: { summary: string | null }): NoteTab {
  return note.summary ? 'resumo' : 'notas';
}

export const noteTabId = (tab: NoteTab) => `note-tab-${tab}`;
export const noteTabPanelId = (tab: NoteTab) => `note-tabpanel-${tab}`;

/** Position in the switcher (for the slide direction between tabs) */
export function noteTabIndex(tab: NoteTab): number {
  return NOTE_TABS.findIndex((t) => t.id === tab);
}

/** The tab panel slides with the switcher's pill (same timing) */
export const NOTE_TAB_TRANSITION = SEGMENTED_CONTROL_TRANSITION;
