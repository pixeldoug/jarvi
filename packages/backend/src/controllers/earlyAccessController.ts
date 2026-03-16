import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { sendEarlyAccessApprovalEmail } from '../services/emailService';
import type {
  SlackApprovalLeadPayload,
  SlackInteractionPayload,
  SlackMessageRefResult,
} from '../services/slackApprovalService';
import {
  SLACK_APPROVE_ACTION_ID,
  SLACK_REJECT_ACTION_ID,
  parseSlackInteractionPayload,
  upsertSlackApprovalMessage,
  updateSlackApprovalMessageStatus,
  verifySlackRequestSignature,
} from '../services/slackApprovalService';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHATSAPP_REGEX = /^\+?\d{10,15}$/;

const normalizeEmail = (value: string): string => value.trim().toLowerCase();
const normalizeWhatsapp = (value: string): string => value.trim().replace(/[^\d+]/g, '');
const sanitizeString = (value: unknown, maxLength = 1000): string => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
};

const parseBoolean = (value: unknown): boolean => value === true;
const MAX_ARRAY_SIZE = 16;

const parseStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_ARRAY_SIZE);

  return Array.from(new Set(normalized));
};

type InterviewAvailability = 'yes' | 'no' | 'later';

interface NormalizedWizardPayload {
  email: string;
  name: string;
  areas: string[];
  areasOther: string;
  taskOrigins: string[];
  taskOriginsOther: string;
  trackingMethods: string[];
  trackingMethodsOther: string;
  painPoints: string[];
  painPointsOther: string;
  desiredCapabilities: string[];
  desiredCapabilitiesOther: string;
  idealOutcomeText: string;
  interviewAvailability: InterviewAvailability;
  contactValue: string;
  contactType: 'email' | 'whatsapp' | null;
  wantsBroadcastUpdates: boolean;
  memorySeedText: string;
  source: string;
  flowVersion: string;
}

interface ExistingOnboardingLeadRow {
  id: string;
  slack_channel_id?: string | null;
  slack_message_ts?: string | null;
}

const isInterviewAvailability = (value: unknown): value is InterviewAvailability =>
  value === 'yes' || value === 'no' || value === 'later';

const getOtherDetails = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const getWizardValidationError = (payload: NormalizedWizardPayload): string | null => {
  if (!payload.name) return 'Nome é obrigatório';
  if (!payload.email) return 'Email é obrigatório';
  if (!EMAIL_REGEX.test(payload.email)) return 'Formato de email inválido';
  if (payload.areas.length === 0) return 'Selecione ao menos uma área';
  if (payload.taskOrigins.length === 0) return 'Selecione ao menos uma origem de tarefas';
  if (payload.trackingMethods.length === 0) return 'Selecione ao menos uma forma de registro';
  if (payload.painPoints.length === 0) return 'Selecione ao menos um desafio atual';
  if (payload.desiredCapabilities.length === 0) return 'Selecione ao menos uma expectativa';
  if (payload.taskOrigins.length > 3) return 'Você pode escolher no máximo 3 origens de tarefas';
  if (!payload.idealOutcomeText) return 'Conte o resultado ideal esperado';
  if (!payload.memorySeedText) return 'Texto de memória inicial é obrigatório';

  if (payload.areas.includes('other') && !payload.areasOther) {
    return 'Detalhe o campo "Outros" em áreas';
  }
  if (payload.taskOrigins.includes('other') && !payload.taskOriginsOther) {
    return 'Detalhe o campo "Outros" em origem das tarefas';
  }
  if (payload.trackingMethods.includes('other') && !payload.trackingMethodsOther) {
    return 'Detalhe o campo "Outros" em métodos de registro';
  }
  if (payload.painPoints.includes('other') && !payload.painPointsOther) {
    return 'Detalhe o campo "Outros" em desafios';
  }
  if (payload.desiredCapabilities.includes('other') && !payload.desiredCapabilitiesOther) {
    return 'Detalhe o campo "Outra coisa" em expectativas';
  }
  if (payload.interviewAvailability === 'yes') {
    if (!payload.contactValue) return 'Contato é obrigatório para entrevista';
    if (!payload.contactType) return 'Informe um WhatsApp ou email válido para contato';
  }

  return null;
};

const parseWizardPayload = (rawPayload: Record<string, unknown>): NormalizedWizardPayload | null => {
  const otherDetails = getOtherDetails(rawPayload.otherDetails);
  const email = normalizeEmail(sanitizeString(rawPayload.email, 255));
  const name = sanitizeString(rawPayload.name, 120);
  const areas = parseStringArray(rawPayload.areas);
  const taskOrigins = parseStringArray(rawPayload.taskOrigins);
  const trackingMethods = parseStringArray(rawPayload.trackingMethods);
  const painPoints = parseStringArray(rawPayload.painPoints);
  const desiredCapabilities = parseStringArray(rawPayload.desiredCapabilities);
  const idealOutcomeText = sanitizeString(rawPayload.idealOutcomeText, 2000);
  const memorySeedText = sanitizeString(rawPayload.memorySeedText, 4000);
  const interviewAvailabilityRaw = rawPayload.interviewAvailability;
  const interviewAvailability = isInterviewAvailability(interviewAvailabilityRaw)
    ? interviewAvailabilityRaw
    : null;

  if (!interviewAvailability) return null;

  const contactValue = sanitizeString(rawPayload.contactValue, 255);
  const normalizedContactEmail = normalizeEmail(contactValue);
  const normalizedContactWhatsapp = normalizeWhatsapp(contactValue);
  const contactType = EMAIL_REGEX.test(normalizedContactEmail)
    ? 'email'
    : WHATSAPP_REGEX.test(normalizedContactWhatsapp)
      ? 'whatsapp'
      : null;

  return {
    email,
    name,
    areas,
    areasOther: sanitizeString(otherDetails.areas, 500),
    taskOrigins,
    taskOriginsOther: sanitizeString(otherDetails.taskOrigins, 500),
    trackingMethods,
    trackingMethodsOther: sanitizeString(otherDetails.trackingMethods, 500),
    painPoints,
    painPointsOther: sanitizeString(otherDetails.painPoints, 500),
    desiredCapabilities,
    desiredCapabilitiesOther: sanitizeString(otherDetails.desiredCapabilities, 500),
    idealOutcomeText,
    interviewAvailability,
    contactValue: interviewAvailability === 'yes' ? contactValue : '',
    contactType: interviewAvailability === 'yes' ? contactType : null,
    wantsBroadcastUpdates: parseBoolean(rawPayload.wantsBroadcastUpdates),
    memorySeedText,
    source: sanitizeString(rawPayload.source, 80) || 'marketing-onboarding',
    flowVersion: sanitizeString(rawPayload.flowVersion, 80) || 'figma-onboarding-v1',
  };
};

const isWizardPayload = (payload: Record<string, unknown>): boolean => {
  if (typeof payload.flowVersion === 'string' && payload.flowVersion.startsWith('figma-onboarding')) {
    return true;
  }

  return (
    typeof payload.name === 'string' ||
    Array.isArray(payload.areas) ||
    Array.isArray(payload.taskOrigins) ||
    Array.isArray(payload.trackingMethods)
  );
};

const buildSlackLeadPayload = (
  leadId: string,
  normalizedPayload: NormalizedWizardPayload
): SlackApprovalLeadPayload => ({
  leadId,
  name: normalizedPayload.name,
  email: normalizedPayload.email,
  source: normalizedPayload.source,
  flowVersion: normalizedPayload.flowVersion,
  interviewAvailability: normalizedPayload.interviewAvailability,
  contactValue: normalizedPayload.contactValue,
  wantsBroadcastUpdates: normalizedPayload.wantsBroadcastUpdates,
  areas: normalizedPayload.areas,
  taskOrigins: normalizedPayload.taskOrigins,
  trackingMethods: normalizedPayload.trackingMethods,
  painPoints: normalizedPayload.painPoints,
  desiredCapabilities: normalizedPayload.desiredCapabilities,
  idealOutcomeText: normalizedPayload.idealOutcomeText,
  memorySeedText: normalizedPayload.memorySeedText,
});

const buildExistingMessageRef = (
  existingLead: ExistingOnboardingLeadRow | null
): SlackMessageRefResult | null => {
  if (!existingLead?.slack_channel_id || !existingLead.slack_message_ts) return null;
  return {
    channelId: existingLead.slack_channel_id,
    messageTs: existingLead.slack_message_ts,
  };
};

const markOnboardingLeadAsPendingApproval = async (
  leadId: string,
  nowIso: string
): Promise<void> => {
  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE onboarding_leads
         SET approval_status = $1,
             approval_requested_at = $2,
             approved_at = $3,
             approved_by = $4,
             rejected_at = $5,
             rejected_by = $6,
             approval_email_sent_at = $7,
             updated_at = $8
         WHERE id = $9`,
        ['pending', nowIso, null, null, null, null, null, nowIso, leadId]
      );
    } finally {
      client.release();
    }

    return;
  }

  const db = getDatabase();
  await db.run(
    `UPDATE onboarding_leads
     SET approval_status = ?,
         approval_requested_at = ?,
         approved_at = ?,
         approved_by = ?,
         rejected_at = ?,
         rejected_by = ?,
         approval_email_sent_at = ?,
         updated_at = ?
     WHERE id = ?`,
    ['pending', nowIso, null, null, null, null, null, nowIso, leadId]
  );
};

const saveSlackMessageRefForLead = async (
  leadId: string,
  messageRef: SlackMessageRefResult
): Promise<void> => {
  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE onboarding_leads
         SET slack_channel_id = $1,
             slack_message_ts = $2,
             updated_at = $3
         WHERE id = $4`,
        [messageRef.channelId, messageRef.messageTs, new Date().toISOString(), leadId]
      );
    } finally {
      client.release();
    }

    return;
  }

  const db = getDatabase();
  await db.run(
    `UPDATE onboarding_leads
     SET slack_channel_id = ?,
         slack_message_ts = ?,
         updated_at = ?
     WHERE id = ?`,
    [messageRef.channelId, messageRef.messageTs, new Date().toISOString(), leadId]
  );
};

const syncLeadApprovalMessage = async (params: {
  leadId: string;
  normalizedPayload: NormalizedWizardPayload;
  existingMessageRef: SlackMessageRefResult | null;
}): Promise<void> => {
  try {
    const slackPayload = buildSlackLeadPayload(params.leadId, params.normalizedPayload);
    const messageRef = await upsertSlackApprovalMessage(slackPayload, params.existingMessageRef);
    if (!messageRef) return;
    await saveSlackMessageRefForLead(params.leadId, messageRef);
  } catch (error) {
    console.error('Slack approval sync error:', error);
  }
};

type LeadApprovalStatus = 'pending' | 'approved' | 'rejected';

interface OnboardingLeadApprovalRecord extends SlackApprovalLeadPayload {
  approvalStatus: LeadApprovalStatus;
  approvalEmailSentAt: string | null;
  slackChannelId: string | null;
  slackMessageTs: string | null;
}

const parseDbBoolean = (value: unknown): boolean => value === true || value === 1 || value === '1';

const parseJsonArrayField = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim());
  }

  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  } catch (error) {
    return [];
  }
};

const parseInterviewAvailability = (value: unknown): InterviewAvailability => {
  if (value === 'yes' || value === 'no' || value === 'later') return value;
  return 'no';
};

const parseApprovalStatus = (value: unknown): LeadApprovalStatus => {
  if (value === 'approved' || value === 'rejected') return value;
  return 'pending';
};

const mapLeadRowToApprovalRecord = (
  row: Record<string, unknown>
): OnboardingLeadApprovalRecord => ({
  leadId: sanitizeString(row.id, 128),
  name: sanitizeString(row.name, 120),
  email: normalizeEmail(sanitizeString(row.email, 255)),
  source: sanitizeString(row.source, 120) || 'marketing-onboarding',
  flowVersion: sanitizeString(row.flow_version, 120) || 'figma-onboarding-v1',
  interviewAvailability: parseInterviewAvailability(row.interview_availability),
  contactValue: sanitizeString(row.contact_value, 255),
  wantsBroadcastUpdates: parseDbBoolean(row.wants_broadcast_updates),
  areas: parseJsonArrayField(row.areas_json),
  taskOrigins: parseJsonArrayField(row.task_origins_json),
  trackingMethods: parseJsonArrayField(row.tracking_methods_json),
  painPoints: parseJsonArrayField(row.pain_points_json),
  desiredCapabilities: parseJsonArrayField(row.desired_capabilities_json),
  idealOutcomeText: sanitizeString(row.ideal_outcome_text, 2000),
  memorySeedText: sanitizeString(row.memory_seed_text, 4000),
  approvalStatus: parseApprovalStatus(row.approval_status),
  approvalEmailSentAt: sanitizeString(row.approval_email_sent_at, 80) || null,
  slackChannelId: sanitizeString(row.slack_channel_id, 120) || null,
  slackMessageTs: sanitizeString(row.slack_message_ts, 120) || null,
});

const getOnboardingLeadApprovalRecordById = async (
  leadId: string
): Promise<OnboardingLeadApprovalRecord | null> => {
  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT id,
                name,
                email,
                source,
                flow_version,
                interview_availability,
                contact_value,
                wants_broadcast_updates,
                areas_json,
                task_origins_json,
                tracking_methods_json,
                pain_points_json,
                desired_capabilities_json,
                ideal_outcome_text,
                memory_seed_text,
                approval_status,
                approval_email_sent_at,
                slack_channel_id,
                slack_message_ts
         FROM onboarding_leads
         WHERE id = $1`,
        [leadId]
      );

      const row = (result.rows[0] as Record<string, unknown> | undefined) || null;
      if (!row) return null;

      return mapLeadRowToApprovalRecord(row);
    } finally {
      client.release();
    }
  }

  const db = getDatabase();
  const row = ((await db.get(
    `SELECT id,
            name,
            email,
            source,
            flow_version,
            interview_availability,
            contact_value,
            wants_broadcast_updates,
            areas_json,
            task_origins_json,
            tracking_methods_json,
            pain_points_json,
            desired_capabilities_json,
            ideal_outcome_text,
            memory_seed_text,
            approval_status,
            approval_email_sent_at,
            slack_channel_id,
            slack_message_ts
     FROM onboarding_leads
     WHERE id = ?`,
    [leadId]
  )) as Record<string, unknown> | undefined) || null;
  if (!row) return null;

  return mapLeadRowToApprovalRecord(row);
};

const updateOnboardingLeadDecision = async (params: {
  leadId: string;
  status: Exclude<LeadApprovalStatus, 'pending'>;
  reviewerId: string;
  reviewedAtIso: string;
}): Promise<void> => {
  const approvedAt = params.status === 'approved' ? params.reviewedAtIso : null;
  const approvedBy = params.status === 'approved' ? params.reviewerId : null;
  const rejectedAt = params.status === 'rejected' ? params.reviewedAtIso : null;
  const rejectedBy = params.status === 'rejected' ? params.reviewerId : null;

  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE onboarding_leads
         SET approval_status = $1,
             approved_at = $2,
             approved_by = $3,
             rejected_at = $4,
             rejected_by = $5,
             updated_at = $6
         WHERE id = $7`,
        [params.status, approvedAt, approvedBy, rejectedAt, rejectedBy, params.reviewedAtIso, params.leadId]
      );
    } finally {
      client.release();
    }

    return;
  }

  const db = getDatabase();
  await db.run(
    `UPDATE onboarding_leads
     SET approval_status = ?,
         approved_at = ?,
         approved_by = ?,
         rejected_at = ?,
         rejected_by = ?,
         updated_at = ?
     WHERE id = ?`,
    [params.status, approvedAt, approvedBy, rejectedAt, rejectedBy, params.reviewedAtIso, params.leadId]
  );
};

const markOnboardingApprovalEmailAsSent = async (
  leadId: string,
  sentAtIso: string
): Promise<void> => {
  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE onboarding_leads
         SET approval_email_sent_at = $1,
             updated_at = $2
         WHERE id = $3`,
        [sentAtIso, sentAtIso, leadId]
      );
    } finally {
      client.release();
    }

    return;
  }

  const db = getDatabase();
  await db.run(
    `UPDATE onboarding_leads
     SET approval_email_sent_at = ?,
         updated_at = ?
     WHERE id = ?`,
    [sentAtIso, sentAtIso, leadId]
  );
};

const resolveMessageRefForInteraction = (
  lead: OnboardingLeadApprovalRecord,
  interaction: SlackInteractionPayload
): SlackMessageRefResult | null => {
  if (lead.slackChannelId && lead.slackMessageTs) {
    return {
      channelId: lead.slackChannelId,
      messageTs: lead.slackMessageTs,
    };
  }

  if (interaction.channel?.id && interaction.message?.ts) {
    return {
      channelId: interaction.channel.id,
      messageTs: interaction.message.ts,
    };
  }

  return null;
};

export const handleSlackApprovalInteraction = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString('utf8')
      : typeof req.body === 'string'
        ? req.body
        : '';
    if (!rawBody) {
      res.status(400).json({ error: 'Corpo da requisicao Slack ausente' });
      return;
    }

    const timestampHeader = req.headers['x-slack-request-timestamp'];
    const signatureHeader = req.headers['x-slack-signature'];
    const timestamp =
      typeof timestampHeader === 'string'
        ? timestampHeader
        : Array.isArray(timestampHeader)
          ? timestampHeader[0]
          : undefined;
    const signature =
      typeof signatureHeader === 'string'
        ? signatureHeader
        : Array.isArray(signatureHeader)
          ? signatureHeader[0]
          : undefined;

    const isValidSignature = verifySlackRequestSignature({
      rawBody,
      timestampHeader: timestamp,
      signatureHeader: signature,
    });
    if (!isValidSignature) {
      res.status(401).json({ error: 'Assinatura Slack inválida' });
      return;
    }

    const interaction = parseSlackInteractionPayload(rawBody);
    if (!interaction) {
      res.status(400).json({ error: 'Payload de interatividade inválido' });
      return;
    }

    const action = interaction.actions?.[0];
    if (!action) {
      res.status(200).json({ ok: true });
      return;
    }

    if (action.action_id !== SLACK_APPROVE_ACTION_ID && action.action_id !== SLACK_REJECT_ACTION_ID) {
      res.status(200).json({ ok: true });
      return;
    }

    const leadId = sanitizeString(action.value, 128);
    if (!leadId) {
      res.status(400).json({ error: 'Lead ID ausente na ação do Slack' });
      return;
    }

    const lead = await getOnboardingLeadApprovalRecordById(leadId);
    if (!lead) {
      res.status(200).json({
        response_type: 'ephemeral',
        text: 'Lead não encontrado ou removido.',
      });
      return;
    }

    const targetStatus: Exclude<LeadApprovalStatus, 'pending'> =
      action.action_id === SLACK_APPROVE_ACTION_ID ? 'approved' : 'rejected';
    const reviewedAtIso = new Date().toISOString();
    const reviewerId = sanitizeString(interaction.user?.id, 120) || 'unknown';
    const reviewerName =
      sanitizeString(interaction.user?.real_name, 120) ||
      sanitizeString(interaction.user?.name, 120) ||
      sanitizeString(interaction.user?.username, 120) ||
      reviewerId;

    let effectiveStatus: Exclude<LeadApprovalStatus, 'pending'>;

    if (lead.approvalStatus === 'pending') {
      await updateOnboardingLeadDecision({
        leadId: lead.leadId,
        status: targetStatus,
        reviewerId,
        reviewedAtIso,
      });
      lead.approvalStatus = targetStatus;
      effectiveStatus = targetStatus;
    } else if (lead.approvalStatus !== targetStatus) {
      const currentStatusText = lead.approvalStatus === 'approved' ? 'aprovado' : 'reprovado';
      res.status(200).json({
        response_type: 'ephemeral',
        text: `Esse lead ja foi ${currentStatusText} anteriormente.`,
      });
      return;
    } else {
      effectiveStatus = targetStatus;
    }

    if (effectiveStatus === 'approved' && !lead.approvalEmailSentAt) {
      await sendEarlyAccessApprovalEmail(lead.email, lead.name);
      await markOnboardingApprovalEmailAsSent(lead.leadId, reviewedAtIso);
      lead.approvalEmailSentAt = reviewedAtIso;
    }

    const messageRef = resolveMessageRefForInteraction(lead, interaction);
    if (messageRef) {
      try {
        await updateSlackApprovalMessageStatus(lead, messageRef, {
          status: effectiveStatus,
          reviewerId,
          reviewerName,
          reviewedAtIso,
        });
      } catch (error) {
        console.error('Slack approval status update error:', error);
      }
    }

    const decisionText = effectiveStatus === 'approved' ? 'aprovado' : 'reprovado';
    res.status(200).json({
      response_type: 'ephemeral',
      text: `Lead ${lead.name} foi marcado como ${decisionText}.`,
    });
  } catch (error) {
    console.error('Slack approval interaction error:', error);
    res.status(500).json({ error: 'Falha ao processar aprovação via Slack' });
  }
};

export const joinEarlyAccess = async (req: Request, res: Response): Promise<void> => {
  try {
    const payload =
      typeof req.body === 'object' && req.body !== null
        ? (req.body as Record<string, unknown>)
        : {};

    if (isWizardPayload(payload)) {
      const normalizedPayload = parseWizardPayload(payload);
      if (!normalizedPayload) {
        res.status(400).json({ error: 'Payload do onboarding inválido' });
        return;
      }

      const wizardValidationError = getWizardValidationError(normalizedPayload);
      if (wizardValidationError) {
        res.status(400).json({ error: wizardValidationError });
        return;
      }

      const now = new Date().toISOString();
      const rawPayloadJson = JSON.stringify(payload);
      const areasJson = JSON.stringify(normalizedPayload.areas);
      const taskOriginsJson = JSON.stringify(normalizedPayload.taskOrigins);
      const trackingMethodsJson = JSON.stringify(normalizedPayload.trackingMethods);
      const painPointsJson = JSON.stringify(normalizedPayload.painPoints);
      const desiredCapabilitiesJson = JSON.stringify(normalizedPayload.desiredCapabilities);

      let leadId = '';
      let existingMessageRef: SlackMessageRefResult | null = null;
      let wasExistingLead = false;

      if (isPostgreSQL()) {
        const pool = getPool();
        const client = await pool.connect();
        try {
          const existingLeadResult = await client.query(
            'SELECT id, slack_channel_id, slack_message_ts FROM onboarding_leads WHERE email = $1',
            [normalizedPayload.email]
          );
          const existingLead = (existingLeadResult.rows[0] as ExistingOnboardingLeadRow | undefined) || null;

          if (existingLead) {
            leadId = existingLead.id;
            existingMessageRef = buildExistingMessageRef(existingLead);
            wasExistingLead = true;

            await client.query(
              `UPDATE onboarding_leads
               SET name = $1,
                   areas_json = $2,
                   areas_other = $3,
                   task_origins_json = $4,
                   task_origins_other = $5,
                   tracking_methods_json = $6,
                   tracking_methods_other = $7,
                   pain_points_json = $8,
                   pain_points_other = $9,
                   desired_capabilities_json = $10,
                   desired_capabilities_other = $11,
                   ideal_outcome_text = $12,
                   interview_availability = $13,
                   contact_value = $14,
                   contact_type = $15,
                   wants_broadcast_updates = $16,
                   memory_seed_text = $17,
                   raw_payload_json = $18,
                   source = $19,
                   flow_version = $20,
                   updated_at = $21
               WHERE email = $22`,
              [
                normalizedPayload.name,
                areasJson,
                normalizedPayload.areasOther || null,
                taskOriginsJson,
                normalizedPayload.taskOriginsOther || null,
                trackingMethodsJson,
                normalizedPayload.trackingMethodsOther || null,
                painPointsJson,
                normalizedPayload.painPointsOther || null,
                desiredCapabilitiesJson,
                normalizedPayload.desiredCapabilitiesOther || null,
                normalizedPayload.idealOutcomeText,
                normalizedPayload.interviewAvailability,
                normalizedPayload.contactValue || null,
                normalizedPayload.contactType,
                normalizedPayload.wantsBroadcastUpdates,
                normalizedPayload.memorySeedText,
                rawPayloadJson,
                normalizedPayload.source,
                normalizedPayload.flowVersion,
                now,
                normalizedPayload.email,
              ]
            );
          } else {
            leadId = uuidv4();

            await client.query(
              `INSERT INTO onboarding_leads (
                id,
                email,
                name,
                areas_json,
                areas_other,
                task_origins_json,
                task_origins_other,
                tracking_methods_json,
                tracking_methods_other,
                pain_points_json,
                pain_points_other,
                desired_capabilities_json,
                desired_capabilities_other,
                ideal_outcome_text,
                interview_availability,
                contact_value,
                contact_type,
                wants_broadcast_updates,
                memory_seed_text,
                raw_payload_json,
                source,
                flow_version,
                created_at,
                updated_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
                $19, $20, $21, $22, $23, $24
              )`,
              [
                leadId,
                normalizedPayload.email,
                normalizedPayload.name,
                areasJson,
                normalizedPayload.areasOther || null,
                taskOriginsJson,
                normalizedPayload.taskOriginsOther || null,
                trackingMethodsJson,
                normalizedPayload.trackingMethodsOther || null,
                painPointsJson,
                normalizedPayload.painPointsOther || null,
                desiredCapabilitiesJson,
                normalizedPayload.desiredCapabilitiesOther || null,
                normalizedPayload.idealOutcomeText,
                normalizedPayload.interviewAvailability,
                normalizedPayload.contactValue || null,
                normalizedPayload.contactType,
                normalizedPayload.wantsBroadcastUpdates,
                normalizedPayload.memorySeedText,
                rawPayloadJson,
                normalizedPayload.source,
                normalizedPayload.flowVersion,
                now,
                now,
              ]
            );
          }
        } finally {
          client.release();
        }
      } else {
        const db = getDatabase();
        const existingLead = ((await db.get(
          'SELECT id, slack_channel_id, slack_message_ts FROM onboarding_leads WHERE email = ?',
          [normalizedPayload.email]
        )) as ExistingOnboardingLeadRow | undefined) || null;

        if (existingLead) {
          leadId = existingLead.id;
          existingMessageRef = buildExistingMessageRef(existingLead);
          wasExistingLead = true;

          await db.run(
            `UPDATE onboarding_leads
             SET name = ?,
                 areas_json = ?,
                 areas_other = ?,
                 task_origins_json = ?,
                 task_origins_other = ?,
                 tracking_methods_json = ?,
                 tracking_methods_other = ?,
                 pain_points_json = ?,
                 pain_points_other = ?,
                 desired_capabilities_json = ?,
                 desired_capabilities_other = ?,
                 ideal_outcome_text = ?,
                 interview_availability = ?,
                 contact_value = ?,
                 contact_type = ?,
                 wants_broadcast_updates = ?,
                 memory_seed_text = ?,
                 raw_payload_json = ?,
                 source = ?,
                 flow_version = ?,
                 updated_at = ?
             WHERE email = ?`,
            [
              normalizedPayload.name,
              areasJson,
              normalizedPayload.areasOther || null,
              taskOriginsJson,
              normalizedPayload.taskOriginsOther || null,
              trackingMethodsJson,
              normalizedPayload.trackingMethodsOther || null,
              painPointsJson,
              normalizedPayload.painPointsOther || null,
              desiredCapabilitiesJson,
              normalizedPayload.desiredCapabilitiesOther || null,
              normalizedPayload.idealOutcomeText,
              normalizedPayload.interviewAvailability,
              normalizedPayload.contactValue || null,
              normalizedPayload.contactType,
              normalizedPayload.wantsBroadcastUpdates,
              normalizedPayload.memorySeedText,
              rawPayloadJson,
              normalizedPayload.source,
              normalizedPayload.flowVersion,
              now,
              normalizedPayload.email,
            ]
          );
        } else {
          leadId = uuidv4();

          await db.run(
            `INSERT INTO onboarding_leads (
              id,
              email,
              name,
              areas_json,
              areas_other,
              task_origins_json,
              task_origins_other,
              tracking_methods_json,
              tracking_methods_other,
              pain_points_json,
              pain_points_other,
              desired_capabilities_json,
              desired_capabilities_other,
              ideal_outcome_text,
              interview_availability,
              contact_value,
              contact_type,
              wants_broadcast_updates,
              memory_seed_text,
              raw_payload_json,
              source,
              flow_version,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              leadId,
              normalizedPayload.email,
              normalizedPayload.name,
              areasJson,
              normalizedPayload.areasOther || null,
              taskOriginsJson,
              normalizedPayload.taskOriginsOther || null,
              trackingMethodsJson,
              normalizedPayload.trackingMethodsOther || null,
              painPointsJson,
              normalizedPayload.painPointsOther || null,
              desiredCapabilitiesJson,
              normalizedPayload.desiredCapabilitiesOther || null,
              normalizedPayload.idealOutcomeText,
              normalizedPayload.interviewAvailability,
              normalizedPayload.contactValue || null,
              normalizedPayload.contactType,
              normalizedPayload.wantsBroadcastUpdates,
              normalizedPayload.memorySeedText,
              rawPayloadJson,
              normalizedPayload.source,
              normalizedPayload.flowVersion,
              now,
              now,
            ]
          );
        }
      }

      await markOnboardingLeadAsPendingApproval(leadId, now);
      await syncLeadApprovalMessage({
        leadId,
        normalizedPayload,
        existingMessageRef,
      });

      res.status(wasExistingLead ? 200 : 201).json({
        success: true,
        message: wasExistingLead
          ? 'Seu onboarding foi atualizado com sucesso.'
          : 'Cadastro recebido! Em breve entraremos em contato.',
      });
      return;
    }

    const email = sanitizeString(payload.email, 255);
    const whatsapp = sanitizeString(payload.whatsapp, 64);
    const wantsBroadcastUpdates = parseBoolean(payload.wantsBroadcastUpdates);
    const source = sanitizeString(payload.source, 80) || 'marketing-landing';

    if (!email || !whatsapp) {
      res.status(400).json({ error: 'Email e WhatsApp são obrigatórios' });
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    const normalizedWhatsapp = normalizeWhatsapp(whatsapp);

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      res.status(400).json({ error: 'Formato de email inválido' });
      return;
    }

    if (!WHATSAPP_REGEX.test(normalizedWhatsapp)) {
      res.status(400).json({ error: 'Formato de WhatsApp inválido' });
      return;
    }

    const now = new Date().toISOString();

    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const existingLeadResult = await client.query(
          'SELECT id FROM early_access_leads WHERE email = $1',
          [normalizedEmail]
        );

        if (existingLeadResult.rows.length > 0) {
          await client.query(
            `UPDATE early_access_leads
             SET whatsapp = $1, wants_broadcast_updates = $2, source = $3, updated_at = $4
             WHERE email = $5`,
            [normalizedWhatsapp, wantsBroadcastUpdates, source, now, normalizedEmail]
          );

          res.status(200).json({
            success: true,
            message: 'Você já estava na lista, atualizamos seus dados.',
          });
          return;
        }

        await client.query(
          `INSERT INTO early_access_leads (
            id, email, whatsapp, wants_broadcast_updates, source, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [uuidv4(), normalizedEmail, normalizedWhatsapp, wantsBroadcastUpdates, source, now, now]
        );
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      const existingLead = await db.get('SELECT id FROM early_access_leads WHERE email = ?', [
        normalizedEmail,
      ]);

      if (existingLead) {
        await db.run(
          `UPDATE early_access_leads
           SET whatsapp = ?, wants_broadcast_updates = ?, source = ?, updated_at = ?
           WHERE email = ?`,
          [normalizedWhatsapp, wantsBroadcastUpdates, source, now, normalizedEmail]
        );

        res.status(200).json({
          success: true,
          message: 'Você já estava na lista, atualizamos seus dados.',
        });
        return;
      }

      await db.run(
        `INSERT INTO early_access_leads (
          id, email, whatsapp, wants_broadcast_updates, source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), normalizedEmail, normalizedWhatsapp, wantsBroadcastUpdates, source, now, now]
      );
    }

    res.status(201).json({
      success: true,
      message: 'Cadastro recebido! Em breve entraremos em contato.',
    });
  } catch (error) {
    console.error('Early access lead error:', error);
    res.status(500).json({ error: 'Falha ao registrar acesso antecipado' });
  }
};
