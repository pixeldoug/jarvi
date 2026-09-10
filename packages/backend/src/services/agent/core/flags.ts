/**
 * Feature flags for the incremental AI-architecture rollout.
 *
 * Each entrega ships behind its own flag, OFF by default, so it can be turned
 * on for internal users first and switched off again without touching data.
 *
 *   AGENT_RELIABLE_EXECUTION = off | internal | on      (default: off)
 *   AGENT_INTERNAL_USER_EMAILS = a@x.com,b@y.com        (used by `internal`)
 *
 * Resolution is per user (by email) so both channels and the eval harness
 * make the same decision for the same person.
 */

export type RolloutMode = 'off' | 'internal' | 'on';

function parseMode(raw: string | undefined): RolloutMode {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'on' || value === 'true' || value === '1') return 'on';
  if (value === 'internal') return 'internal';
  return 'off';
}

function parseEmailList(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isInternalUser(email: string | undefined | null): boolean {
  if (!email) return false;
  return parseEmailList(process.env.AGENT_INTERNAL_USER_EMAILS).has(email.trim().toLowerCase());
}

function resolveFlag(envVar: string, email: string | undefined | null): boolean {
  const mode = parseMode(process.env[envVar]);
  if (mode === 'on') return true;
  if (mode === 'internal') return isInternalUser(email);
  return false;
}

/** Entrega 1 — execução e confirmações confiáveis. */
export function isReliableExecutionEnabled(email: string | undefined | null): boolean {
  return resolveFlag('AGENT_RELIABLE_EXECUTION', email);
}
