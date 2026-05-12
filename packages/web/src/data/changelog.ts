export type ChangelogItemType = 'feature' | 'improvement' | 'fix';

export interface ChangelogItem {
  type: ChangelogItemType;
  text: string;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  title?: string;
  items: ChangelogItem[];
}

/**
 * Bump this string whenever you add a new entry that users should see.
 * Do NOT bump for bug-fix-only deploys that don't need user visibility.
 */
export const LATEST_CHANGELOG_VERSION = '5';

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: '5',
    date: '12 de maio de 2026',
    title: 'Integração com Gmail',
    items: [
      {
        type: 'feature',
        text: 'Conecte sua conta Gmail e crie tarefas diretamente a partir dos seus e-mails.',
      },
      {
        type: 'feature',
        text: 'A IA extrai automaticamente prazos e ações dos e-mails para preencher os campos da tarefa.',
      },
    ],
  },
  {
    version: '4',
    date: '28 de abril de 2026',
    title: 'Áudios no WhatsApp',
    items: [
      {
        type: 'feature',
        text: 'Envie mensagens de voz pelo WhatsApp e a Jarvi transcreve e cria a tarefa automaticamente.',
      },
      {
        type: 'improvement',
        text: 'Reconhecimento aprimorado em português, inglês e espanhol.',
      },
    ],
  },
  {
    version: '3',
    date: '10 de abril de 2026',
    title: 'Temas e personalização',
    items: [
      {
        type: 'feature',
        text: 'Modo claro e escuro com suporte automático às preferências do sistema.',
      },
      {
        type: 'feature',
        text: 'Imagens de fundo personalizadas para o seu espaço de trabalho.',
      },
    ],
  },
];

export const EMOJI_MAP: Record<ChangelogItemType, string> = {
  feature: '⭐',
  improvement: '⚙️',
  fix: '🐛',
};
