export type ChangelogItemType = 'feature' | 'improvement' | 'fix';

export interface ChangelogItem {
  type: ChangelogItemType;
  text: string;
}

export interface ChangelogEntry {
  id: string;
  date: string;
  isoDate: string;
  title?: string;
  items: ChangelogItem[];
}

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    id: '2026-05-integracao-gmail',
    date: '12 de maio de 2026',
    isoDate: '2026-05-12',
    title: 'Integração com Gmail',
    items: [
      {
        type: 'feature',
        text: 'Conecte sua conta Gmail e crie tarefas diretamente a partir dos seus e-mails.',
      },
      {
        type: 'feature',
        text: 'Tarefas criadas via Gmail aparecem automaticamente na seção "Hoje" com o contexto do e-mail preservado.',
      },
      {
        type: 'improvement',
        text: 'A IA da Jarvi extrai automaticamente prazos, destinatários e ações dos seus e-mails para preencher os campos da tarefa.',
      },
    ],
  },
  {
    id: '2026-04-whatsapp-audios',
    date: '28 de abril de 2026',
    isoDate: '2026-04-28',
    title: 'Áudios no WhatsApp',
    items: [
      {
        type: 'feature',
        text: 'Envie mensagens de voz pelo WhatsApp e a Jarvi transcreve e cria a tarefa automaticamente.',
      },
      {
        type: 'improvement',
        text: 'Reconhecimento de idioma aprimorado: suporte a português, inglês e espanhol nos áudios.',
      },
      {
        type: 'fix',
        text: 'Corrigido problema onde tarefas criadas via WhatsApp às vezes apareciam duplicadas.',
      },
    ],
  },
  {
    id: '2026-04-temas-personalizados',
    date: '10 de abril de 2026',
    isoDate: '2026-04-10',
    title: 'Temas e personalização',
    items: [
      {
        type: 'feature',
        text: 'Escolha entre modo claro e escuro, com suporte automático às preferências do sistema.',
      },
      {
        type: 'feature',
        text: 'Imagens de fundo personalizadas: defina uma foto como plano de fundo do seu espaço de trabalho.',
      },
      {
        type: 'improvement',
        text: 'Paleta de cores atualizada com maior contraste para melhor acessibilidade.',
      },
    ],
  },
  {
    id: '2026-03-ia-memoria',
    date: '18 de março de 2026',
    isoDate: '2026-03-18',
    title: 'Memória inteligente com IA',
    items: [
      {
        type: 'feature',
        text: 'A Jarvi agora lembra do contexto das suas tarefas anteriores e sugere ações com base no seu histórico.',
      },
      {
        type: 'feature',
        text: 'Novo painel de memória: veja e gerencie tudo o que a Jarvi aprendeu sobre você.',
      },
      {
        type: 'improvement',
        text: 'Sugestões de data e prioridade mais precisas com base nos seus padrões de uso.',
      },
    ],
  },
  {
    id: '2026-02-lancamento',
    date: '5 de fevereiro de 2026',
    isoDate: '2026-02-05',
    title: 'Lançamento da Jarvi 🎉',
    items: [
      {
        type: 'feature',
        text: 'Gerenciamento de tarefas com IA: crie, organize e priorize tarefas com linguagem natural.',
      },
      {
        type: 'feature',
        text: 'Integração com WhatsApp: envie mensagens e transforme-as em tarefas automaticamente.',
      },
      {
        type: 'feature',
        text: 'Categorias e filtros personalizados para organizar seu trabalho do seu jeito.',
      },
      {
        type: 'feature',
        text: 'Notas integradas ao fluxo de tarefas com suporte a rich text.',
      },
    ],
  },
];

export const EMOJI_MAP: Record<ChangelogItemType, string> = {
  feature: '⭐',
  improvement: '⚙️',
  fix: '🐛',
};
