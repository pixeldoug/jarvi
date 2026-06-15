const SLACK_API_BASE = 'https://slack.com/api';

export interface SlackNewAccountPayload {
  userId: string;
  leadId: string;
  name: string;
  email: string;
  source: string;
  flowVersion: string;
  interviewAvailability: 'yes' | 'no' | 'later';
  contactValue: string;
  wantsBroadcastUpdates: boolean;
  trackingMethods: string[];
  painPoints: string[];
  desiredCapabilities: string[];
  idealOutcomeText: string;
  memorySeedText: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referringDomain: string | null;
}

interface SlackApiErrorResponse {
  ok: false;
  error?: string;
}

interface SlackApiMessageResponse {
  ok: true;
  channel: string;
  ts: string;
}

type SlackApiResponse = SlackApiErrorResponse | SlackApiMessageResponse;

const getSlackBotToken = (): string => process.env.SLACK_BOT_TOKEN?.trim() || '';
const getSlackChannelId = (): string => process.env.SLACK_APPROVAL_CHANNEL_ID?.trim() || '';

export const getMissingSlackConfig = (): string[] => {
  const missing: string[] = [];
  if (!getSlackBotToken()) missing.push('SLACK_BOT_TOKEN');
  if (!getSlackChannelId()) missing.push('SLACK_APPROVAL_CHANNEL_ID');
  return missing;
};

export const isSlackApprovalConfigured = (): boolean => getMissingSlackConfig().length === 0;

// Rotulos legiveis espelhando o front (packages/web/src/pages/CriarConta/index.tsx).
const TRACKING_METHOD_LABELS: Record<string, string> = {
  'mobile-notes': 'Anotacoes no celular',
  'paper-notebook': 'Papel & caderno',
  'self-whatsapp': 'WhatsApp comigo mesmo',
  'agenda-calendar': 'Agenda & Calendario',
  spreadsheets: 'Planilhas',
  'productivity-apps': 'Apps de produtividade (Notion, ClickUp, etc)',
  'memory-only': 'Tenta lembrar de cabeca',
  'no-system': 'Nao tem um sistema',
};

const PAIN_POINT_LABELS: Record<string, string> = {
  'forget-fast-capture': 'Esquece se nao anota na hora',
  'hard-prioritization': 'Dificuldade em priorizar',
  'overwhelmed-many-tasks': 'Sobrecarregado(a) com tudo que tem pra fazer',
  'procrastinate-important': 'Procrastina o importante',
  'dont-know-start': 'Nao sabe por onde comecar',
};

const DESIRED_CAPABILITY_LABELS: Record<string, string> = {
  'organize-fast': 'Organizar tudo em segundos',
  'give-clarity': 'Ter mais clareza do que precisa fazer',
  'auto-organize-week': 'Organizar a semana automaticamente',
  'decide-what-first': 'Priorizar o que fazer primeiro',
  'ideas-to-plan': 'Transformar ideias em planos claros',
  'suggest-next-steps': 'Sugerir proximos passos',
  'extract-from-email-notes': 'Extrair tarefas de ferramentas externas',
};

const INTERVIEW_LABELS: Record<string, string> = {
  yes: 'Sim',
  no: 'Nao',
  later: 'Talvez mais tarde',
};

// Origem de trafego: mapeia utm_source/medium crus para rotulos amigaveis.
const UTM_SOURCE_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  ig: 'Instagram',
  facebook: 'Facebook',
  fb: 'Facebook',
  google: 'Google',
  bing: 'Bing',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
  newsletter: 'Newsletter',
  email: 'Email',
};

const UTM_MEDIUM_LABELS: Record<string, string> = {
  cpc: 'anuncio',
  ppc: 'anuncio',
  paid: 'anuncio',
  paid_social: 'anuncio',
  ads: 'anuncio',
  organic: 'organico',
  social: 'social',
  referral: 'indicacao',
  email: 'email',
  affiliate: 'afiliado',
};

const prettify = (value: string): string =>
  value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();

const resolveLabels = (values: string[], labels: Record<string, string>): string[] =>
  values.map((value) => labels[value] ?? value);

const bulletize = (values: string[], labels: Record<string, string>): string =>
  resolveLabels(values, labels)
    .map((label) => `• ${label}`)
    .join('\n');

const buildOriginLabel = (lead: SlackNewAccountPayload): string => {
  const utmSource = lead.utmSource?.trim();
  const utmMedium = lead.utmMedium?.trim();
  const utmCampaign = lead.utmCampaign?.trim();
  const referringDomain = lead.referringDomain?.trim();

  if (utmSource) {
    const sourceLabel = UTM_SOURCE_LABELS[utmSource.toLowerCase()] ?? prettify(utmSource);
    const mediumLabel = utmMedium ? UTM_MEDIUM_LABELS[utmMedium.toLowerCase()] ?? utmMedium : '';
    let label = mediumLabel ? `${sourceLabel} (${mediumLabel})` : sourceLabel;
    if (utmCampaign) label += ` · ${utmCampaign}`;
    return label;
  }

  if (referringDomain && referringDomain !== '$direct' && referringDomain.toLowerCase() !== 'direct') {
    return `${referringDomain} (organico)`;
  }

  return 'Direto';
};

interface SlackField {
  type: 'mrkdwn';
  text: string;
}

// Quando o contato for um WhatsApp, monta um link wa.me clicavel (digitos sem
// "+"). Caso contrario (email ou vazio), devolve o texto puro.
const buildContactLine = (lead: SlackNewAccountPayload): string => {
  const value = lead.contactValue.trim();
  if (!value) return '—';
  if (/^\+?\d{10,15}$/.test(value)) {
    const digits = value.replace(/\D/g, '');
    return `<https://wa.me/${digits}|${value}>`;
  }
  return value;
};

const buildContactFields = (lead: SlackNewAccountPayload): SlackField[] => [
  { type: 'mrkdwn', text: `*Nome*\n${lead.name}` },
  { type: 'mrkdwn', text: `*Email*\n${lead.email}` },
  { type: 'mrkdwn', text: `*Contato*\n${buildContactLine(lead)}` },
  {
    type: 'mrkdwn',
    text: `*Entrevista*\n${INTERVIEW_LABELS[lead.interviewAvailability] ?? lead.interviewAvailability}`,
  },
  { type: 'mrkdwn', text: `*Broadcast WhatsApp*\n${lead.wantsBroadcastUpdates ? 'Sim' : 'Nao'}` },
];

const buildProfileSection = (lead: SlackNewAccountPayload): string => {
  const groups: string[] = [];

  if (lead.trackingMethods.length > 0) {
    groups.push(`:inbox_tray: *Como registra tarefas*\n${bulletize(lead.trackingMethods, TRACKING_METHOD_LABELS)}`);
  }
  if (lead.painPoints.length > 0) {
    groups.push(`:pushpin: *Dores*\n${bulletize(lead.painPoints, PAIN_POINT_LABELS)}`);
  }
  if (lead.desiredCapabilities.length > 0) {
    groups.push(`:sparkles: *Desejos*\n${bulletize(lead.desiredCapabilities, DESIRED_CAPABILITY_LABELS)}`);
  }

  return groups.join('\n\n');
};

const buildNewAccountBlocks = (lead: SlackNewAccountPayload): Record<string, unknown>[] => {
  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: 'Nova conta criada',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:earth_americas: *Origem:* ${buildOriginLabel(lead)}`,
      },
    },
    {
      type: 'section',
      fields: buildContactFields(lead),
    },
  ];

  const profileText = buildProfileSection(lead);
  if (profileText) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: profileText },
    });
  }

  if (lead.idealOutcomeText) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `:checkered_flag: *Resultado ideal*\n${lead.idealOutcomeText}` },
    });
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `:bust_in_silhouette: User ID: \`${lead.userId}\`  ·  ${lead.source} · ${lead.flowVersion}`,
      },
    ],
  });

  return blocks;
};

const parseSlackApiError = (response: unknown): string => {
  if (typeof response !== 'object' || response === null) return 'unknown_error';
  const error = (response as { error?: unknown }).error;
  return typeof error === 'string' ? error : 'unknown_error';
};

const callSlackApi = async (
  endpoint: string,
  payload: Record<string, unknown>
): Promise<SlackApiMessageResponse> => {
  const token = getSlackBotToken();
  if (!token) {
    throw new Error('Slack bot token is not configured');
  }

  const response = await fetch(`${SLACK_API_BASE}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => ({ ok: false, error: 'invalid_json' }))) as SlackApiResponse;
  if (!response.ok || !data.ok) {
    const error = parseSlackApiError(data);
    throw new Error(`Slack API ${endpoint} failed: ${error}`);
  }

  return data;
};

export const postNewAccountNotification = async (
  lead: SlackNewAccountPayload
): Promise<void> => {
  if (!isSlackApprovalConfigured()) {
    return;
  }

  await callSlackApi('chat.postMessage', {
    channel: getSlackChannelId(),
    text: `Nova conta criada: ${lead.name} (${lead.email})`,
    blocks: buildNewAccountBlocks(lead),
  });
};
