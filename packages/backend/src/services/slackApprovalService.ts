import crypto from 'crypto';

export const SLACK_APPROVE_ACTION_ID = 'approve_early_access';
export const SLACK_REJECT_ACTION_ID = 'reject_early_access';

const SLACK_API_BASE = 'https://slack.com/api';
const MAX_CLOCK_SKEW_SECONDS = 60 * 5;

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

interface SlackUserRef {
  id: string;
  username?: string;
  name?: string;
  real_name?: string;
}

interface SlackChannelRef {
  id: string;
}

interface SlackMessageRef {
  ts: string;
}

interface SlackAction {
  action_id: string;
  value?: string;
}

export interface SlackInteractionPayload {
  type: string;
  user: SlackUserRef;
  channel: SlackChannelRef;
  message: SlackMessageRef;
  actions?: SlackAction[];
}

export interface SlackApprovalLeadPayload {
  leadId: string;
  name: string;
  email: string;
  source: string;
  flowVersion: string;
  interviewAvailability: 'yes' | 'no' | 'later';
  contactValue: string;
  wantsBroadcastUpdates: boolean;
  areas: string[];
  taskOrigins: string[];
  trackingMethods: string[];
  painPoints: string[];
  desiredCapabilities: string[];
  idealOutcomeText: string;
  memorySeedText: string;
}

export interface SlackMessageRefResult {
  channelId: string;
  messageTs: string;
}

interface SlackDecisionInfo {
  status: Exclude<ApprovalStatus, 'pending'>;
  reviewerId: string;
  reviewerName?: string;
  reviewedAtIso: string;
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
const getSlackSigningSecret = (): string => process.env.SLACK_SIGNING_SECRET?.trim() || '';
const getSlackChannelId = (): string => process.env.SLACK_APPROVAL_CHANNEL_ID?.trim() || '';

export const getMissingSlackConfig = (): string[] => {
  const missing: string[] = [];
  if (!getSlackBotToken()) missing.push('SLACK_BOT_TOKEN');
  if (!getSlackSigningSecret()) missing.push('SLACK_SIGNING_SECRET');
  if (!getSlackChannelId()) missing.push('SLACK_APPROVAL_CHANNEL_ID');
  return missing;
};

export const isSlackApprovalConfigured = (): boolean => getMissingSlackConfig().length === 0;

const formatList = (values: string[]): string => {
  if (values.length === 0) return 'n/a';
  return values.join(', ');
};

const buildLeadSummary = (lead: SlackApprovalLeadPayload): string => {
  const lines = [
    `*Lead ID:* \`${lead.leadId}\``,
    `*Nome:* ${lead.name}`,
    `*Email:* ${lead.email}`,
    `*Entrevista:* ${lead.interviewAvailability}`,
    `*Contato:* ${lead.contactValue || 'n/a'}`,
    `*Broadcast WhatsApp:* ${lead.wantsBroadcastUpdates ? 'sim' : 'nao'}`,
    `*Areas:* ${formatList(lead.areas)}`,
    `*Origem de tarefas:* ${formatList(lead.taskOrigins)}`,
    `*Como registra tarefas:* ${formatList(lead.trackingMethods)}`,
    `*Dores:* ${formatList(lead.painPoints)}`,
    `*Desejos:* ${formatList(lead.desiredCapabilities)}`,
    `*Resultado ideal:* ${lead.idealOutcomeText || 'n/a'}`,
    `*Contexto (memory):* ${lead.memorySeedText || 'n/a'}`,
    `*Source:* ${lead.source} | *Flow:* ${lead.flowVersion}`,
  ];

  return lines.join('\n');
};

const getStatusLabel = (status: ApprovalStatus): string => {
  if (status === 'approved') return 'Aprovado';
  if (status === 'rejected') return 'Reprovado';
  return 'Pendente';
};

const buildApprovalBlocks = (
  lead: SlackApprovalLeadPayload,
  status: ApprovalStatus,
  decisionInfo?: SlackDecisionInfo
): Record<string, unknown>[] => {
  const statusEmoji =
    status === 'approved' ? ':white_check_mark:' : status === 'rejected' ? ':x:' : ':hourglass_flowing_sand:';

  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: 'Novo pedido de acesso antecipado',
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${statusEmoji} *Status:* ${getStatusLabel(status)}`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: buildLeadSummary(lead),
      },
    },
  ];

  if (status === 'pending') {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          style: 'primary',
          action_id: SLACK_APPROVE_ACTION_ID,
          text: {
            type: 'plain_text',
            text: 'Aprovar',
          },
          value: lead.leadId,
        },
        {
          type: 'button',
          style: 'danger',
          action_id: SLACK_REJECT_ACTION_ID,
          text: {
            type: 'plain_text',
            text: 'Reprovar',
          },
          value: lead.leadId,
        },
      ],
    });
  } else if (decisionInfo) {
    const reviewerLabel = decisionInfo.reviewerName || decisionInfo.reviewerId;
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Decisao registrada por <@${decisionInfo.reviewerId}> (${reviewerLabel}) em ${decisionInfo.reviewedAtIso}.`,
        },
      ],
    });
  }

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

export const upsertSlackApprovalMessage = async (
  lead: SlackApprovalLeadPayload,
  currentMessage?: SlackMessageRefResult | null
): Promise<SlackMessageRefResult | null> => {
  if (!isSlackApprovalConfigured()) {
    return null;
  }

  const blocks = buildApprovalBlocks(lead, 'pending');
  if (currentMessage?.channelId && currentMessage?.messageTs) {
    const result = await callSlackApi('chat.update', {
      channel: currentMessage.channelId,
      ts: currentMessage.messageTs,
      text: `Revisao de acesso antecipado: ${lead.name} (${lead.email})`,
      blocks,
    });

    return { channelId: result.channel, messageTs: result.ts };
  }

  const result = await callSlackApi('chat.postMessage', {
    channel: getSlackChannelId(),
    text: `Novo pedido de acesso antecipado: ${lead.name} (${lead.email})`,
    blocks,
  });

  return { channelId: result.channel, messageTs: result.ts };
};

export const updateSlackApprovalMessageStatus = async (
  lead: SlackApprovalLeadPayload,
  messageRef: SlackMessageRefResult,
  decisionInfo: SlackDecisionInfo
): Promise<void> => {
  if (!isSlackApprovalConfigured()) {
    return;
  }

  const blocks = buildApprovalBlocks(lead, decisionInfo.status, decisionInfo);
  await callSlackApi('chat.update', {
    channel: messageRef.channelId,
    ts: messageRef.messageTs,
    text: `Pedido ${getStatusLabel(decisionInfo.status).toLowerCase()}: ${lead.name} (${lead.email})`,
    blocks,
  });
};

export const parseSlackInteractionPayload = (rawBody: string): SlackInteractionPayload | null => {
  const parsed = new URLSearchParams(rawBody);
  const payloadRaw = parsed.get('payload');
  if (!payloadRaw) return null;

  try {
    const payload = JSON.parse(payloadRaw) as SlackInteractionPayload;
    return payload;
  } catch (error) {
    return null;
  }
};

export const verifySlackRequestSignature = (params: {
  rawBody: string;
  timestampHeader?: string;
  signatureHeader?: string;
}): boolean => {
  const secret = getSlackSigningSecret();
  if (!secret) return false;

  const { rawBody, timestampHeader, signatureHeader } = params;
  if (!timestampHeader || !signatureHeader) return false;

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) return false;

  const nowInSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowInSeconds - timestamp) > MAX_CLOCK_SKEW_SECONDS) return false;

  const baseString = `v0:${timestampHeader}:${rawBody}`;
  const digest = `v0=${crypto.createHmac('sha256', secret).update(baseString, 'utf8').digest('hex')}`;

  const digestBuffer = Buffer.from(digest, 'utf8');
  const signatureBuffer = Buffer.from(signatureHeader, 'utf8');
  if (digestBuffer.length !== signatureBuffer.length) return false;

  return crypto.timingSafeEqual(digestBuffer, signatureBuffer);
};
