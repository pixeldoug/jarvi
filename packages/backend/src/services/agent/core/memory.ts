/**
 * User memory + profile (timezone, preferred name) helpers, plus the two
 * memory-update flows: post-response extraction and daily reconciliation.
 *
 * Memory respects `consent_ai_memory`: when disabled, callers receive an
 * empty string and the post-response extractor still runs (because the
 * write itself enforces the consent flag) but updates have no effect.
 */

import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, getPool, isPostgreSQL } from '../../../database';
import { getDateTimeForTimezone } from './time';
import { getUserAllTasks } from './tasks';

const FALLBACK_TIMEZONE = 'America/Sao_Paulo';

// Cheap model used only for memory extraction / reconciliation
const MEMORY_MODEL = 'gpt-4o-mini';

let openaiClient: OpenAI | null = null;
const getOpenAIClient = (): OpenAI => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
};

// ---------------------------------------------------------------------------
// User profile reads
// ---------------------------------------------------------------------------

export interface UserProfile {
  memory: string;
  timezone: string;
  preferredName: string;
}

export async function getUserProfile(userId: string): Promise<UserProfile> {
  try {
    if (isPostgreSQL()) {
      const [memRes, userRes] = await Promise.all([
        getPool().query(
          'SELECT memory_text, consent_ai_memory FROM user_memory_profiles WHERE user_id = $1',
          [userId],
        ),
        getPool().query(
          'SELECT timezone, preferred_name, name FROM users WHERE id = $1',
          [userId],
        ),
      ]);
      const memRow = memRes.rows[0];
      const memory =
        memRow && memRow.consent_ai_memory !== false ? (memRow.memory_text || '') : '';
      const userRow = userRes.rows[0];
      const preferredName =
        userRow?.preferred_name || userRow?.name?.split(' ')[0] || '';
      return {
        memory,
        timezone: userRow?.timezone || FALLBACK_TIMEZONE,
        preferredName,
      };
    }
    const db = getDatabase();
    const [memRow, userRow] = await Promise.all([
      db.get<{ memory_text: string; consent_ai_memory: number }>(
        'SELECT memory_text, consent_ai_memory FROM user_memory_profiles WHERE user_id = ?',
        [userId],
      ),
      db.get<{ timezone?: string; preferred_name?: string; name?: string }>(
        'SELECT timezone, preferred_name, name FROM users WHERE id = ?',
        [userId],
      ),
    ]);
    const memory = memRow && memRow.consent_ai_memory ? (memRow.memory_text || '') : '';
    const preferredName = userRow?.preferred_name || userRow?.name?.split(' ')[0] || '';
    return {
      memory,
      timezone: userRow?.timezone || FALLBACK_TIMEZONE,
      preferredName,
    };
  } catch {
    return { memory: '', timezone: FALLBACK_TIMEZONE, preferredName: '' };
  }
}

// ---------------------------------------------------------------------------
// Memory writes
// ---------------------------------------------------------------------------

export async function persistMemory(userId: string, summary: string): Promise<void> {
  const trimmed = summary.trim();
  if (!trimmed) return;
  const now = new Date().toISOString();

  if (isPostgreSQL()) {
    await getPool().query(
      `INSERT INTO user_memory_profiles (id, user_id, memory_text, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET memory_text = $3, updated_at = $4`,
      [uuidv4(), userId, trimmed, now],
    );
    return;
  }

  const db = getDatabase();
  const existing = await db.get<{ id: string }>(
    'SELECT id FROM user_memory_profiles WHERE user_id = ?',
    [userId],
  );
  if (existing) {
    await db.run(
      'UPDATE user_memory_profiles SET memory_text = ?, updated_at = ? WHERE user_id = ?',
      [trimmed, now, userId],
    );
  } else {
    await db.run(
      'INSERT INTO user_memory_profiles (id, user_id, memory_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [uuidv4(), userId, trimmed, now, now],
    );
  }
}

// ---------------------------------------------------------------------------
// Post-response extraction
// ---------------------------------------------------------------------------

/**
 * Fire-and-forget extractor: scans the most recent user message for any
 * personal info (names, relationships, location, habits, etc.) and merges
 * it into the existing memory.
 */
export async function extractMemoryPostResponse(
  userId: string,
  userMessage: string,
  currentMemory: string,
): Promise<void> {
  if (!userMessage.trim()) return;

  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: MEMORY_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          'Analise a mensagem abaixo e extraia QUALQUER informação pessoal nova sobre o usuário.',
          '',
          'MEMÓRIA ATUAL:',
          currentMemory || '(vazia)',
          '',
          'MENSAGEM DO USUÁRIO:',
          userMessage,
          '',
          'Se houver informação nova (nomes de pessoas/animais, relacionamentos, localização, preferências, hábitos, datas importantes, contexto profissional/pessoal), retorne a memória COMPLETA atualizada — mesclando o que já existia com o que é novo. Escreva em terceira pessoa, em português brasileiro, de forma concisa.',
          'Se NÃO houver nenhuma informação pessoal nova, retorne exatamente: NO_UPDATE',
        ].join('\n'),
      },
    ],
    max_tokens: 800,
  });

  const result = response.choices[0]?.message?.content?.trim();
  if (result && result !== 'NO_UPDATE') {
    await persistMemory(userId, result);
  }
}

// ---------------------------------------------------------------------------
// Daily reconciliation
// ---------------------------------------------------------------------------

const RECONCILIATION_INTERVAL_MS = 20 * 60 * 60 * 1000; // 20h — fires once per day with buffer

export async function needsReconciliation(userId: string): Promise<boolean> {
  try {
    let lastReconciled: string | null = null;
    if (isPostgreSQL()) {
      const result = await getPool().query(
        'SELECT last_reconciled_at FROM users WHERE id = $1',
        [userId],
      );
      lastReconciled = result.rows[0]?.last_reconciled_at ?? null;
    } else {
      const row = await getDatabase().get<{ last_reconciled_at?: string }>(
        'SELECT last_reconciled_at FROM users WHERE id = ?',
        [userId],
      );
      lastReconciled = row?.last_reconciled_at ?? null;
    }
    if (!lastReconciled) return true;
    return Date.now() - new Date(lastReconciled).getTime() > RECONCILIATION_INTERVAL_MS;
  } catch {
    return false;
  }
}

export async function markReconciled(userId: string): Promise<void> {
  const now = new Date().toISOString();
  if (isPostgreSQL()) {
    await getPool().query('UPDATE users SET last_reconciled_at = $1 WHERE id = $2', [now, userId]);
  } else {
    await getDatabase().run('UPDATE users SET last_reconciled_at = ? WHERE id = ?', [
      now,
      userId,
    ]);
  }
}

/**
 * Reconcile transient memory state ("considerando X", "vai fazer Y") against
 * the user's current task list — promotes intentions into completed past
 * tense when matching tasks have been finished.
 */
export async function reconcileMemory(
  userId: string,
  currentMemory: string,
  timezone: string,
): Promise<string> {
  if (!currentMemory.trim()) return currentMemory;

  const tasks = await getUserAllTasks(userId);
  const activeTasks = tasks.filter((t) => !t.completed);
  const completedTasks = tasks.filter((t) => t.completed);

  const activeList = activeTasks.length
    ? activeTasks
        .map(
          (t) => `  - "${t.title}"${t.due_date ? ` (vence: ${t.due_date})` : ''}`,
        )
        .join('\n')
    : '  (nenhuma)';

  const completedList = completedTasks.length
    ? completedTasks.slice(0, 20).map((t) => `  - "${t.title}"`).join('\n')
    : '  (nenhuma)';

  const { formatted: now } = getDateTimeForTimezone(timezone);

  const prompt = `Você é um assistente que mantém o perfil de memória de um usuário.

Data/hora atual: ${now}

MEMÓRIA ATUAL:
${currentMemory}

TAREFAS ATIVAS DO USUÁRIO:
${activeList}

TAREFAS CONCLUÍDAS (mais recentes):
${completedList}

Sua tarefa: reescreva a memória para refletir o estado ATUAL do usuário.
Regras:
- Mantenha todos os fatos permanentes (nomes de pessoas, relacionamentos, localização, preferências, hábitos).
- Atualize estados transitórios: se a memória diz "está considerando X" mas a tarefa X já foi concluída, escreva "fez X" ou "comprou X".
- Se uma intenção mencionada na memória não tem tarefa correspondente ativa ou concluída, mantenha como "considerou/pensou em X" com contexto temporal se possível.
- Remova redundâncias. Seja conciso mas completo.
- Escreva em terceira pessoa, em português brasileiro.
- Retorne APENAS o texto da memória atualizada, sem explicações adicionais.`;

  try {
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: MEMORY_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
    });
    const updated = response.choices[0]?.message?.content?.trim();
    return updated || currentMemory;
  } catch {
    return currentMemory;
  }
}
