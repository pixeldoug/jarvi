/**
 * GoogleLogin Stories
 * Storybook stories for the GoogleLogin component
 */

import type { Meta, StoryObj } from '@storybook/react';
import { GoogleLogin } from './GoogleLogin';

const meta = {
  title: 'Features/Auth/GoogleLogin',
  component: GoogleLogin,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    onSuccess: { action: 'success' },
    onError: { action: 'error' },
  },
} satisfies Meta<typeof GoogleLogin>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default Google Login button following JarviDS design system
 */
export const Default: Story = {
  args: {
    onSuccess: () => console.log('Login successful!'),
    onError: (error) => console.error('Login error:', error),
  },
};

/**
 * Google Login button in a form context
 */
export const InForm: Story = {
  render: (args) => (
    <div style={{ 
      maxWidth: '404px', 
      padding: '24px',
      backgroundColor: 'var(--semantic-surface-primary)',
      border: '1px solid var(--semantic-border-primary)',
      borderRadius: '16px'
    }}>
      <h2 style={{ 
        margin: '0 0 8px',
        fontSize: 'var(--typography-heading-h4-font-size)',
        fontWeight: 'var(--typography-heading-h4-font-weight)',
        color: 'var(--semantic-content-primary)'
      }}>
        Entre na sua conta
      </h2>
      <p style={{ 
        margin: '0 0 24px',
        fontSize: 'var(--typography-body-md-font-size)',
        color: 'var(--semantic-content-secondary)'
      }}>
        Use sua conta Google para continuar
      </p>
      <GoogleLogin {...args} />
    </div>
  ),
};

/**
 * Google Login button states demonstration
 */
export const States: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '404px' }}>
      <div>
        <h4 style={{ margin: '0 0 8px', color: 'var(--semantic-content-primary)' }}>Default State</h4>
        <div style={{ 
          padding: '16px',
          border: '1px solid var(--semantic-border-primary)',
          backgroundColor: 'var(--semantic-surface-primary)',
          borderRadius: '8px'
        }}>
          <p style={{ 
            margin: '0 0 8px', 
            fontSize: '14px',
            color: 'var(--semantic-content-secondary)'
          }}>
            Button ready to be clicked
          </p>
        </div>
      </div>
      
      <div>
        <h4 style={{ margin: '0 0 8px', color: 'var(--semantic-content-primary)' }}>Hover State</h4>
        <div style={{ 
          padding: '16px',
          border: '1px solid var(--semantic-border-primary)',
          backgroundColor: 'var(--semantic-surface-primary)',
          borderRadius: '8px'
        }}>
          <p style={{ 
            margin: '0 0 8px', 
            fontSize: '14px',
            color: 'var(--semantic-content-secondary)'
          }}>
            Hover over the button to see the effect
          </p>
        </div>
      </div>

      <div>
        <h4 style={{ margin: '0 0 8px', color: 'var(--semantic-content-primary)' }}>Design Specs</h4>
        <div style={{ 
          padding: '16px',
          border: '1px solid var(--semantic-border-primary)',
          backgroundColor: 'var(--semantic-surface-secondary)',
          borderRadius: '8px'
        }}>
          <ul style={{ 
            margin: '0', 
            paddingLeft: '20px',
            fontSize: '14px',
            color: 'var(--semantic-content-secondary)'
          }}>
            <li>Width: 100% (max 404px)</li>
            <li>Height: 48px</li>
            <li>Border Radius: 16px</li>
            <li>Gap: 8px</li>
            <li>Font: Poppins Regular 15px</li>
            <li>Logo: 20x20px</li>
          </ul>
        </div>
      </div>
    </div>
  ),
};

/**
 * Dark mode demonstration
 */
export const DarkMode: Story = {
  render: (args) => (
    <div style={{ 
      padding: '32px',
      backgroundColor: '#18181B',
      borderRadius: '16px'
    }}>
      <div style={{ 
        maxWidth: '404px',
        padding: '24px',
        backgroundColor: '#18181B',
        border: '1px solid #34373C',
        borderRadius: '16px'
      }}>
        <h2 style={{ 
          margin: '0 0 8px',
          fontSize: '24px',
          fontWeight: '600',
          color: '#F7F8F9'
        }}>
          Entre na sua conta
        </h2>
        <p style={{ 
          margin: '0 0 24px',
          fontSize: '15px',
          color: '#B5BCC4'
        }}>
          Use sua conta Google para continuar
        </p>
        <GoogleLogin {...args} />
      </div>
    </div>
  ),
  parameters: {
    backgrounds: { default: 'dark' },
  },
};















