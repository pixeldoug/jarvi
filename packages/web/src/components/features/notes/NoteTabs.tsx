/**
 * NoteTabs — "Notas | Resumo | Transcrição" switcher: the DS SegmentedControl
 * in compact mode (Littlebird style: the active tab shows icon + label, the
 * others are icon-only with a tooltip), with tab semantics over the panels.
 */

import { SegmentedControl, type SegmentedControlItem } from '../../ui';
import { NOTE_TABS, noteTabId, noteTabPanelId, type NoteTab } from './noteTabConfig';

const ITEMS: ReadonlyArray<SegmentedControlItem<NoteTab>> = NOTE_TABS.map((tab) => ({
  value: tab.id,
  label: tab.label,
  icon: tab.icon,
  id: noteTabId(tab.id),
  panelId: noteTabPanelId(tab.id),
}));

export interface NoteTabsProps {
  value: NoteTab;
  onChange: (tab: NoteTab) => void;
}

export function NoteTabs({ value, onChange }: NoteTabsProps) {
  return (
    <SegmentedControl
      items={ITEMS}
      value={value}
      onChange={onChange}
      aria-label="Seções da nota"
      display="compact"
      semantics="tabs"
    />
  );
}
