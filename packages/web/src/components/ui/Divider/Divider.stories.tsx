/**
 * Divider Stories
 * Storybook stories for the Divider component
 */

import type { Meta, StoryObj } from '@storybook/react';
import { Divider } from './Divider';

const meta = {
  title: 'Components/Divider',
  component: Divider,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    orientation: {
      control: 'radio',
      options: ['horizontal', 'vertical'],
      description: 'Orientation of the divider',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: 'horizontal' },
      },
    },
  },
} satisfies Meta<typeof Divider>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default horizontal divider
 */
export const Horizontal: Story = {
  args: {
    orientation: 'horizontal',
  },
  render: (args) => (
    <div>
      <p>Content above</p>
      <Divider {...args} />
      <p>Content below</p>
    </div>
  ),
};

/**
 * Vertical divider
 */
export const Vertical: Story = {
  args: {
    orientation: 'vertical',
  },
  render: (args) => (
    <div style={{ display: 'flex', gap: '16px', alignItems: 'center', height: '100px' }}>
      <span>Left content</span>
      <Divider {...args} />
      <span>Right content</span>
    </div>
  ),
};

/**
 * With custom spacing (horizontal)
 */
export const WithSpacingHorizontal: Story = {
  args: {
    orientation: 'horizontal',
    className: 'my-8',
  },
  render: (args) => (
    <div>
      <p>Content above with more spacing</p>
      <Divider {...args} />
      <p>Content below with more spacing</p>
    </div>
  ),
};

/**
 * Multiple dividers in a list
 */
export const InList: Story = {
  render: () => (
    <div>
      <div style={{ padding: '12px 0' }}>Item 1</div>
      <Divider />
      <div style={{ padding: '12px 0' }}>Item 2</div>
      <Divider />
      <div style={{ padding: '12px 0' }}>Item 3</div>
      <Divider />
      <div style={{ padding: '12px 0' }}>Item 4</div>
    </div>
  ),
};

/**
 * In a card layout
 */
export const InCard: Story = {
  render: () => (
    <div style={{ 
      backgroundColor: 'var(--semantic-surface-primary)', 
      border: '1px solid var(--semantic-border-primary)',
      borderRadius: '8px',
      padding: '24px',
      maxWidth: '400px'
    }}>
      <h3 style={{ margin: '0 0 16px' }}>Card Title</h3>
      <Divider />
      <p style={{ margin: '16px 0' }}>Card content goes here. The divider separates the title from the content.</p>
      <Divider />
      <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
        <button>Action 1</button>
        <button>Action 2</button>
      </div>
    </div>
  ),
};
