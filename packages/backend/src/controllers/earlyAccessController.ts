import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import type { SlackNewAccountPayload } from '../services/slackApprovalService';
import { postNewAccountNotification } from '../services/slackApprovalService';

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
  if (payload.trackingMethods.length === 0) return 'Selecione ao menos uma forma de registro';
  if (payload.painPoints.length === 0) return 'Selecione ao menos um desafio atual';
  if (payload.desiredCapabilities.length === 0) return 'Selecione ao menos uma expectativa';
  if (!payload.memorySeedText) return 'Texto de memória inicial é obrigatório';

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

interface LeadAttribution {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referringDomain: string | null;
}

// A atribuicao (UTM/referrer) viaja dentro do payload bruto, ja persistido em
// raw_payload_json no submit do onboarding — sem necessidade de colunas novas.
const parseAttribution = (rawPayloadJson: unknown): LeadAttribution => {
  const empty: LeadAttribution = {
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    referringDomain: null,
  };

  if (typeof rawPayloadJson !== 'string' || !rawPayloadJson.trim()) return empty;

  try {
    const parsed = JSON.parse(rawPayloadJson) as Record<string, unknown>;
    return {
      utmSource: sanitizeString(parsed.utmSource, 200) || null,
      utmMedium: sanitizeString(parsed.utmMedium, 200) || null,
      utmCampaign: sanitizeString(parsed.utmCampaign, 200) || null,
      referringDomain: sanitizeString(parsed.referringDomain, 200) || null,
    };
  } catch (error) {
    return empty;
  }
};

const mapLeadRowToNotificationPayload = (
  row: Record<string, unknown>,
  userId: string
): SlackNewAccountPayload => {
  const attribution = parseAttribution(row.raw_payload_json);
  return {
    userId: sanitizeString(userId, 128),
    leadId: sanitizeString(row.id, 128),
    name: sanitizeString(row.name, 120),
    email: normalizeEmail(sanitizeString(row.email, 255)),
    source: sanitizeString(row.source, 120) || 'marketing-onboarding',
    flowVersion: sanitizeString(row.flow_version, 120) || 'figma-onboarding-v1',
    interviewAvailability: parseInterviewAvailability(row.interview_availability),
    contactValue: sanitizeString(row.contact_value, 255),
    wantsBroadcastUpdates: parseDbBoolean(row.wants_broadcast_updates),
    trackingMethods: parseJsonArrayField(row.tracking_methods_json),
    painPoints: parseJsonArrayField(row.pain_points_json),
    desiredCapabilities: parseJsonArrayField(row.desired_capabilities_json),
    idealOutcomeText: sanitizeString(row.ideal_outcome_text, 2000),
    memorySeedText: sanitizeString(row.memory_seed_text, 4000),
    ...attribution,
  };
};

const getOnboardingLeadForNotificationByEmail = async (
  email: string,
  userId: string
): Promise<SlackNewAccountPayload | null> => {
  const normalizedEmail = normalizeEmail(email);

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
                tracking_methods_json,
                pain_points_json,
                desired_capabilities_json,
                ideal_outcome_text,
                memory_seed_text,
                raw_payload_json
         FROM onboarding_leads
         WHERE email = $1`,
        [normalizedEmail]
      );

      const row = (result.rows[0] as Record<string, unknown> | undefined) || null;
      if (!row) return null;

      return mapLeadRowToNotificationPayload(row, userId);
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
            tracking_methods_json,
            pain_points_json,
            desired_capabilities_json,
            ideal_outcome_text,
            memory_seed_text,
            raw_payload_json
     FROM onboarding_leads
     WHERE email = ?`,
    [normalizedEmail]
  )) as Record<string, unknown> | undefined) || null;
  if (!row) return null;

  return mapLeadRowToNotificationPayload(row, userId);
};

/**
 * Posta no Slack uma notificacao de "nova conta criada", montada a partir do
 * onboarding lead vinculado ao email. Disparado pelo fluxo de registro (apos a
 * conta de fato existir). Falhas sao logadas e nunca quebram o registro.
 */
export const notifyNewAccountCreated = async (
  email: string,
  userId: string
): Promise<void> => {
  try {
    const lead = await getOnboardingLeadForNotificationByEmail(email, userId);
    if (!lead) return;
    await postNewAccountNotification(lead);
  } catch (error) {
    console.error('Slack new-account notification error:', error);
  }
};

/**
 * Persiste (upsert por email) um lead de onboarding a partir do payload do
 * wizard. Reutilizado tanto pela rota pública `/api/early-access` quanto pelo
 * fluxo de cadastro via Google, onde o email vem do token já verificado.
 *
 * `options.emailOverride` força o email do lead (fonte confiável, ex.: Google),
 * garantindo que o lead case com a conta criada e que a memória inicial seja
 * semeada corretamente.
 */
export const persistOnboardingLead = async (
  rawPayload: Record<string, unknown>,
  options?: { emailOverride?: string }
): Promise<{ ok: boolean; created: boolean; error?: string }> => {
  const normalizedPayload = parseWizardPayload(rawPayload);
  if (!normalizedPayload) {
    return { ok: false, created: false, error: 'Payload do onboarding inválido' };
  }

  if (options?.emailOverride) {
    const overrideEmail = normalizeEmail(options.emailOverride);
    if (overrideEmail) normalizedPayload.email = overrideEmail;
  }

  const wizardValidationError = getWizardValidationError(normalizedPayload);
  if (wizardValidationError) {
    return { ok: false, created: false, error: wizardValidationError };
  }

  const now = new Date().toISOString();
  const rawPayloadJson = JSON.stringify(rawPayload);
  const areasJson = JSON.stringify(normalizedPayload.areas);
  const taskOriginsJson = JSON.stringify(normalizedPayload.taskOrigins);
  const trackingMethodsJson = JSON.stringify(normalizedPayload.trackingMethods);
  const painPointsJson = JSON.stringify(normalizedPayload.painPoints);
  const desiredCapabilitiesJson = JSON.stringify(normalizedPayload.desiredCapabilities);

  let leadId = '';
  let wasExistingLead = false;

  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const existingLeadResult = await client.query(
        'SELECT id FROM onboarding_leads WHERE email = $1',
        [normalizedPayload.email]
      );
      const existingLead = (existingLeadResult.rows[0] as ExistingOnboardingLeadRow | undefined) || null;

      if (existingLead) {
        leadId = existingLead.id;
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
      'SELECT id FROM onboarding_leads WHERE email = ?',
      [normalizedPayload.email]
    )) as ExistingOnboardingLeadRow | undefined) || null;

    if (existingLead) {
      leadId = existingLead.id;
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

  return { ok: true, created: !wasExistingLead };
};

export const joinEarlyAccess = async (req: Request, res: Response): Promise<void> => {
  try {
    const payload =
      typeof req.body === 'object' && req.body !== null
        ? (req.body as Record<string, unknown>)
        : {};

    if (isWizardPayload(payload)) {
      const result = await persistOnboardingLead(payload);
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.status(result.created ? 201 : 200).json({
        success: true,
        message: result.created
          ? 'Cadastro recebido! Em breve entraremos em contato.'
          : 'Seu onboarding foi atualizado com sucesso.',
      });
      return;
    }

    // Fluxo legado de captura de acesso antecipado (email + WhatsApp) foi
    // descontinuado. Mantemos apenas o fluxo do questionario (wizard) acima.
    res.status(410).json({
      error: 'O acesso antecipado foi encerrado.',
    });
  } catch (error) {
    console.error('Early access lead error:', error);
    res.status(500).json({ error: 'Falha ao registrar acesso antecipado' });
  }
};
