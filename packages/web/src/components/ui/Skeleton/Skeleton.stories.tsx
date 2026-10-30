/**
 * Skeleton Stories
 * Storybook stories for the Skeleton component
 */

import type { Meta, StoryObj } from '@storybook/react';
import { Skeleton, SkeletonText } from './Skeleton';

const meta = {
  title: 'Components/Skeleton',
  component: Skeleton,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    shape: {
      control: 'radio',
      options: ['line', 'block'],
      description: 'A rounded bar (text) or a box',
    },
  },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Line: Story = {
  args: { shape: 'line', width: '60%' },
};

export const Block: Story = {
  args: { shape: 'block', height: 120 },
};

/** A paragraph and a heading, sized to the text styles they stand for */
export const Text: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
      <SkeletonText variant="heading" lines={1} widths={['30%']} />
      <SkeletonText lines={3} />
    </div>
  ),
};
