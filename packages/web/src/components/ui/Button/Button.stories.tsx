/**
 * Button Component Stories
 * 
 * Storybook stories for the Button component
 * Demonstrates all variants, sizes, and states
 */

import type { Meta, StoryObj } from '@storybook/react';
import { Plus, Trash, ArrowRight, Heart } from '@phosphor-icons/react';
import { Button } from './Button';

// ============================================================================
// META
// ============================================================================

const meta = {
  title: 'UI/Button',
  component: Button,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Button component following Figma design system specifications. Supports multiple variants, sizes, icon positions, and states.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost', 'destructive'],
      description: 'Visual style variant of the button',
      table: {
        defaultValue: { summary: 'primary' },
      },
    },
    size: {
      control: 'select',
      options: ['small', 'medium'],
      description: 'Size of the button',
      table: {
        defaultValue: { summary: 'medium' },
      },
    },
    iconPosition: {
      control: 'select',
      options: ['none', 'left', 'right', 'icon-only'],
      description: 'Position of the icon',
      table: {
        defaultValue: { summary: 'none' },
      },
    },
    disabled: {
      control: 'boolean',
      description: 'Disables the button',
      table: {
        defaultValue: { summary: 'false' },
      },
    },
    loading: {
      control: 'boolean',
      description: 'Shows loading spinner',
      table: {
        defaultValue: { summary: 'false' },
      },
    },
    fullWidth: {
      control: 'boolean',
      description: 'Makes button full width',
      table: {
        defaultValue: { summary: 'false' },
      },
    },
    children: {
      control: 'text',
      description: 'Button label text',
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

// ============================================================================
// STORIES - VARIANTS
// ============================================================================

export const Primary: Story = {
  args: {
    variant: 'primary',
    children: 'Primary Button',
  },
};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: 'Secondary Button',
  },
};

export const Ghost: Story = {
  args: {
    variant: 'ghost',
    children: 'Ghost Button',
  },
};

export const Destructive: Story = {
  args: {
    variant: 'destructive',
    children: 'Delete',
    icon: Trash,
    iconPosition: 'left',
  },
};

// ============================================================================
// STORIES - SIZES
// ============================================================================

export const SizeMedium: Story = {
  args: {
    size: 'medium',
    children: 'Medium Button',
  },
};

export const SizeSmall: Story = {
  args: {
    size: 'small',
    children: 'Small Button',
  },
};

// ============================================================================
// STORIES - WITH ICONS
// ============================================================================

export const WithIconLeft: Story = {
  args: {
    children: 'Add Item',
    icon: Plus,
    iconPosition: 'left',
  },
};

export const WithIconRight: Story = {
  args: {
    children: 'Continue',
    icon: ArrowRight,
    iconPosition: 'right',
  },
};

export const IconOnly: Story = {
  args: {
    icon: Heart,
    iconPosition: 'icon-only',
    'aria-label': 'Like',
  },
};

export const IconOnlySmall: Story = {
  args: {
    icon: Plus,
    iconPosition: 'icon-only',
    size: 'small',
    'aria-label': 'Add',
  },
};

// ============================================================================
// STORIES - STATES
// ============================================================================

export const Disabled: Story = {
  args: {
    children: 'Disabled Button',
    disabled: true,
  },
};

export const Loading: Story = {
  args: {
    children: 'Loading...',
    loading: true,
  },
};

export const LoadingWithIcon: Story = {
  args: {
    children: 'Saving...',
    loading: true,
    icon: Plus,
    iconPosition: 'left',
  },
};

export const FullWidth: Story = {
  args: {
    children: 'Full Width Button',
    fullWidth: true,
  },
  parameters: {
    layout: 'padded',
  },
};

// ============================================================================
// STORIES - ALL VARIANTS SHOWCASE
// ============================================================================

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '300px' }}>
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Destructive</Button>
    </div>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'flex-start' }}>
      <Button size="medium">Medium Button</Button>
      <Button size="small">Small Button</Button>
    </div>
  ),
};

export const AllIconPositions: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'flex-start' }}>
      <Button icon={Plus} iconPosition="left">Icon Left</Button>
      <Button icon={ArrowRight} iconPosition="right">Icon Right</Button>
      <Button icon={Heart} iconPosition="icon-only" aria-label="Like" />
    </div>
  ),
};

export const AllStates: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '200px' }}>
      <Button>Default</Button>
      <Button disabled>Disabled</Button>
      <Button loading>Loading</Button>
    </div>
  ),
};

// ============================================================================
// STORIES - INTERACTIVE EXAMPLE
// ============================================================================

export const InteractiveExample: Story = {
  render: () => {
    const [count, setCount] = React.useState(0);
    const [isLoading, setIsLoading] = React.useState(false);

    const handleClick = () => {
      setIsLoading(true);
      setTimeout(() => {
        setCount(count + 1);
        setIsLoading(false);
      }, 1000);
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
        <Button 
          icon={Plus} 
          iconPosition="left" 
          onClick={handleClick}
          loading={isLoading}
        >
          Click me ({count})
        </Button>
        <p style={{ fontSize: '14px', color: '#666' }}>
          Button has been clicked {count} time{count !== 1 ? 's' : ''}
        </p>
      </div>
    );
  },
};

// Add React import for interactive example
import React from 'react';

// ============================================================================
// STORIES - DESIGN SYSTEM MATRIX
// ============================================================================

export const DesignSystemMatrix: Story = {
  render: () => (
    <div style={{ padding: '24px' }}>
      <h3 style={{ marginBottom: '24px', fontWeight: 600 }}>Button Design System Matrix</h3>
      
      {/* Primary */}
      <div style={{ marginBottom: '32px' }}>
        <h4 style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 600, color: '#666' }}>Primary</h4>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Button variant="primary" size="medium">Button</Button>
          <Button variant="primary" size="medium" icon={Plus} iconPosition="left">Button</Button>
          <Button variant="primary" size="medium" icon={ArrowRight} iconPosition="right">Button</Button>
          <Button variant="primary" size="medium" icon={Plus} iconPosition="icon-only" aria-label="Add" />
          <Button variant="primary" size="small">Button</Button>
          <Button variant="primary" size="small" icon={Plus} iconPosition="icon-only" aria-label="Add" />
          <Button variant="primary" disabled>Button</Button>
          <Button variant="primary" loading>Button</Button>
        </div>
      </div>

      {/* Secondary */}
      <div style={{ marginBottom: '32px' }}>
        <h4 style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 600, color: '#666' }}>Secondary</h4>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Button variant="secondary" size="medium">Button</Button>
          <Button variant="secondary" size="medium" icon={Plus} iconPosition="left">Button</Button>
          <Button variant="secondary" size="medium" icon={ArrowRight} iconPosition="right">Button</Button>
          <Button variant="secondary" size="medium" icon={Plus} iconPosition="icon-only" aria-label="Add" />
          <Button variant="secondary" size="small">Button</Button>
          <Button variant="secondary" size="small" icon={Plus} iconPosition="icon-only" aria-label="Add" />
          <Button variant="secondary" disabled>Button</Button>
          <Button variant="secondary" loading>Button</Button>
        </div>
      </div>

      {/* Ghost */}
      <div style={{ marginBottom: '32px' }}>
        <h4 style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 600, color: '#666' }}>Ghost</h4>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Button variant="ghost" size="medium">Button</Button>
          <Button variant="ghost" size="medium" icon={Plus} iconPosition="left">Button</Button>
          <Button variant="ghost" size="medium" icon={ArrowRight} iconPosition="right">Button</Button>
          <Button variant="ghost" size="medium" icon={Plus} iconPosition="icon-only" aria-label="Add" />
          <Button variant="ghost" size="small">Button</Button>
          <Button variant="ghost" size="small" icon={Plus} iconPosition="icon-only" aria-label="Add" />
          <Button variant="ghost" disabled>Button</Button>
          <Button variant="ghost" loading>Button</Button>
        </div>
      </div>

      {/* Destructive */}
      <div>
        <h4 style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 600, color: '#666' }}>Destructive</h4>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Button variant="destructive" size="medium">Delete</Button>
          <Button variant="destructive" size="medium" icon={Trash} iconPosition="left">Delete</Button>
          <Button variant="destructive" size="medium" icon={ArrowRight} iconPosition="right">Delete</Button>
          <Button variant="destructive" size="medium" icon={Trash} iconPosition="icon-only" aria-label="Delete" />
          <Button variant="destructive" size="small">Delete</Button>
          <Button variant="destructive" size="small" icon={Trash} iconPosition="icon-only" aria-label="Delete" />
          <Button variant="destructive" disabled>Delete</Button>
          <Button variant="destructive" loading>Deleting...</Button>
        </div>
      </div>
    </div>
  ),
  parameters: {
    layout: 'fullscreen',
  },
};




















