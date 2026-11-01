/**
 * SegmentedControl Stories
 *
 * The two display modes in use: `labels` (Calendar's Semana / Mês) and
 * `compact` (a note's Notas / Resumo / Transcrição tabs).
 */

import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { CalendarBlank, ListBullets, NoteBlank, Sparkle, Subtitles } from '@phosphor-icons/react';
import { SegmentedControl, type SegmentedControlItem } from './SegmentedControl';

const meta = {
  title: 'UI/SegmentedControl',
  component: SegmentedControl,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Pick one of a few views or sections. Raised active pill (taller than the track, light shadow) that slides between segments. `labels`: every segment labelled. `compact`: only the active one labelled, the rest icon-only with a tooltip.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SegmentedControl>;

export default meta;
type Story = StoryObj<typeof meta>;

type View = 'week' | 'month';
const VIEWS: SegmentedControlItem<View>[] = [
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
];

function LabelsDemo() {
  const [value, setValue] = useState<View>('week');
  return (
    <SegmentedControl items={VIEWS} value={value} onChange={setValue} aria-label="Alternar visualização" />
  );
}

type Section = 'notes' | 'summary' | 'transcript';
const SECTIONS: SegmentedControlItem<Section>[] = [
  { value: 'notes', label: 'Notas', icon: NoteBlank },
  { value: 'summary', label: 'Resumo', icon: Sparkle },
  { value: 'transcript', label: 'Transcrição', icon: Subtitles },
];

function CompactDemo() {
  const [value, setValue] = useState<Section>('notes');
  return (
    <SegmentedControl
      items={SECTIONS}
      value={value}
      onChange={setValue}
      aria-label="Seções"
      display="compact"
      semantics="tabs"
    />
  );
}

type Layout = 'list' | 'calendar';
const LAYOUTS: SegmentedControlItem<Layout>[] = [
  { value: 'list', label: 'Lista', icon: ListBullets },
  { value: 'calendar', label: 'Calendário', icon: CalendarBlank },
];

function LabelsWithIconsDemo() {
  const [value, setValue] = useState<Layout>('list');
  return <SegmentedControl items={LAYOUTS} value={value} onChange={setValue} aria-label="Layout" />;
}

// Each story renders its own stateful demo; args are unused.
const demoArgs = { items: [], value: '', onChange: () => {}, 'aria-label': '' };

export const Labels: Story = { args: demoArgs, render: () => <LabelsDemo /> };
export const LabelsWithIcons: Story = { args: demoArgs, render: () => <LabelsWithIconsDemo /> };
export const Compact: Story = { args: demoArgs, render: () => <CompactDemo /> };
