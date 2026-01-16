import type { Meta, StoryObj } from '@storybook/react';

const meta = {
  title: 'Introduction/Welcome',
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Welcome: Story = {
  render: () => (
    <div style={{ maxWidth: '600px', padding: '40px' }}>
      <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '16px' }}>
        Welcome to Jarvi Design System
      </h1>
      <p style={{ fontSize: '16px', lineHeight: '1.6', color: '#666', marginBottom: '24px' }}>
        This is the component library for Jarvi web application. All components follow our Figma design system specifications and use design tokens for consistency.
      </p>
      
      <h2 style={{ fontSize: '24px', fontWeight: '600', marginTop: '32px', marginBottom: '16px' }}>
        Getting Started
      </h2>
      <ul style={{ fontSize: '14px', lineHeight: '1.8', color: '#666', paddingLeft: '20px' }}>
        <li>Browse components in the sidebar</li>
        <li>Use the Controls panel to interact with components</li>
        <li>Check out the Docs tab for detailed documentation</li>
        <li>Switch between light and dark themes using the toolbar</li>
      </ul>

      <h2 style={{ fontSize: '24px', fontWeight: '600', marginTop: '32px', marginBottom: '16px' }}>
        Design System Features
      </h2>
      <ul style={{ fontSize: '14px', lineHeight: '1.8', color: '#666', paddingLeft: '20px' }}>
        <li>✅ Design tokens from Figma</li>
        <li>✅ CSS Modules for styling</li>
        <li>✅ Full TypeScript support</li>
        <li>✅ Accessibility built-in</li>
        <li>✅ Dark mode support</li>
        <li>✅ Responsive design</li>
      </ul>

      <div style={{ 
        marginTop: '32px', 
        padding: '16px', 
        backgroundColor: '#f5f5f5', 
        borderRadius: '8px',
        fontSize: '14px',
        color: '#666'
      }}>
        💡 <strong>Tip:</strong> Start by checking out the <strong>UI/Button</strong> component to see all available variants and states!
      </div>
    </div>
  ),
};






















