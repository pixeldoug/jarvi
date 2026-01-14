/**
 * Logo Stories
 * Storybook stories for the Logo component
 */

import type { Meta, StoryObj } from '@storybook/react';
import { Logo } from './Logo';

const meta = {
  title: 'Components/Logo',
  component: Logo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default logo - 48x48px with icon
 */
export const Default: Story = {};

/**
 * Logo with custom className
 */
export const WithClassName: Story = {
  args: {
    className: 'custom-class',
  },
};

/**
 * In header context
 */
export const InHeader: Story = {
  render: () => (
    <div style={{ 
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      padding: '16px 24px',
      backgroundColor: 'var(--semantic-surface-primary)',
      border: 'px solid var(--semantic-border-primary)',
      borderRadius: '12px',
      minWidth: '300px'
    }}>
      <Logo />
      <div>
        <h3 style={{ 
          margin: '0',
          fontSize: 'var(--typography-heading-h5-font-size)',
          fontWeight: 'var(--typography-heading-h5-font-weight)',
          color: 'var(--semantic-content-primary)'
        }}>
          Jarvi
        </h3>
        <p style={{ 
          margin: '0',
          fontSize: 'var(--typography-label-sm-font-size)',
          color: 'var(--semantic-content-secondary)'
        }}>
          Aplicativo de Produtividade
        </p>
      </div>
    </div>
  ),
};

/**
 * Design specifications from Figma
 */
export const DesignSpecs: Story = {
  render: () => (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '24px',
      maxWidth: '500px'
    }}>
      <div>
        <h4 style={{ margin: '0 0 16px', color: 'var(--semantic-content-primary)' }}>
          Design System Logo
        </h4>
        <Logo />
      </div>
      
      <div style={{ 
        padding: '16px',
        backgroundColor: 'var(--semantic-surface-secondary)',
        borderRadius: '12px'
      }}>
        <h5 style={{ 
          margin: '0 0 12px',
          fontSize: '14px',
          fontWeight: '600',
          color: 'var(--semantic-content-primary)'
        }}>
          Specifications
        </h5>
        <ul style={{ 
          margin: '0',
          paddingLeft: '20px',
          fontSize: '14px',
          color: 'var(--semantic-content-secondary)',
          lineHeight: '1.6'
        }}>
          <li>Size: 48x48px</li>
          <li>Border Radius: 16px (--radius-button-radius)</li>
          <li>Background: --component-logo-bg-default</li>
          <li>Shadow: 0px 1px 0px rgba(24, 24, 27, 0.15)</li>
          <li>Icon: 32x32px</li>
        </ul>
      </div>
    </div>
  ),
};

/**
 * On dark background
 */
export const OnDarkBackground: Story = {
  render: () => (
    <div style={{ 
      padding: '32px',
      backgroundColor: '#18181B',
      borderRadius: '16px',
      display: 'flex',
      justifyContent: 'center'
    }}>
      <Logo />
    </div>
  ),
  parameters: {
    backgrounds: { default: 'dark' },
  },
};















