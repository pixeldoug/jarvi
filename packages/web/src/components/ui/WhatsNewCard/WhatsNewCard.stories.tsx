import type { Meta, StoryObj } from '@storybook/react';
import { CheckCircle, Sparkle } from '@phosphor-icons/react';
import { WhatsNewCard } from './WhatsNewCard';

const meta = {
  title: 'UI/WhatsNewCard',
  component: WhatsNewCard,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Card used to introduce a new feature with media, key benefits, and a primary action.',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onAction: () => undefined,
  },
} satisfies Meta<typeof WhatsNewCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Welcome: Story = {
  args: {
    variant: 'welcome',
    onSecondaryAction: () => undefined,
  },
};

export const Compact: Story = {
  args: {
    size: 'compact',
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};

export const TwoFeatures: Story = {
  args: {
    eyebrow: 'Novidade',
    heading: 'Uma forma mais rápida de organizar seu dia',
    features: [
      {
        icon: Sparkle,
        label: 'Transforme ideias em tarefas sem interromper seu fluxo.',
      },
      {
        icon: CheckCircle,
        label: 'Acompanhe o que já foi concluído em um só lugar.',
      },
    ],
    actionLabel: 'Conhecer recurso',
  },
};
