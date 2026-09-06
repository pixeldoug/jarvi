export interface OnboardingOption {
  value: string;
  label: string;
}

export const TRACKING_METHOD_OPTIONS: OnboardingOption[] = [
  { value: 'mobile-notes', label: 'Anotações no celular' },
  { value: 'paper-notebook', label: 'Papel & caderno' },
  { value: 'self-whatsapp', label: 'WhatsApp comigo mesmo' },
  { value: 'agenda-calendar', label: 'Agenda & Calendário' },
  { value: 'spreadsheets', label: 'Planilhas' },
  { value: 'productivity-apps', label: 'Apps de produtividade (Notion, ClickUp, etc)' },
  { value: 'memory-only', label: 'Tento lembrar de cabeça' },
  { value: 'no-system', label: 'Não tenho um sistema para isso' },
  { value: 'other', label: 'Outros' },
];

export const PAIN_POINT_OPTIONS: OnboardingOption[] = [
  { value: 'forget-fast-capture', label: 'Esqueço tarefas se não anoto na hora' },
  { value: 'hard-prioritization', label: 'Tenho dificuldade em decidir o que é mais importante' },
  { value: 'overwhelmed-many-tasks', label: 'Me sinto sobrecarregado(a) com tudo que tenho pra fazer' },
  { value: 'procrastinate-important', label: 'Procrastino tarefas importantes' },
  { value: 'dont-know-start', label: 'Não sei por onde começar' },
  { value: 'other', label: 'Outros' },
];

export function getLabelsFromSelection(
  options: OnboardingOption[],
  selected: string[],
  otherText: string,
): string[] {
  const labels = options
    .filter((o) => selected.includes(o.value) && o.value !== 'other')
    .map((o) => o.label);
  if (selected.includes('other') && otherText.trim()) labels.push(otherText.trim());
  return labels;
}

export interface FirstTaskTopic {
  id: string;
  title: string;
  examples: string[];
}

export const FIRST_TASK_TOPICS: FirstTaskTopic[] = [
  {
    id: 'health',
    title: 'Saúde',
    examples: [
      'Agendar check-up anual',
      'Agendar consulta no dentista',
      'Agendar consulta no oftalmologista',
      'Pesquisar calendário de vacinas',
    ],
  },
  {
    id: 'money',
    title: 'Dinheiro',
    examples: [
      'Pagar fatura do cartão de crédito',
      'Guardar dinheiro para a reserva de emergência',
      'Revisar assinaturas de aplicativos',
      'Fechar os gastos do mês passado',
    ],
  },
  {
    id: 'home',
    title: 'Casa',
    examples: [
      'Agendar limpeza do ar-condicionado',
      'Comprar gás',
      'Pagar a internet',
      'Trocar o filtro de água',
    ],
  },
  {
    id: 'documents',
    title: 'Documentos',
    examples: ['Renovar CNH', 'Renovar passaporte', 'Pagar IPVA', 'Declarar Imposto de Renda'],
  },
  {
    id: 'people',
    title: 'Pessoas',
    examples: ['Ligar para um parente', 'Agendar um almoço', 'Lembrar um aniversário', 'Mandar uma mensagem'],
  },
];

export function formatList(labels: string[]): string {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} e ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
}
