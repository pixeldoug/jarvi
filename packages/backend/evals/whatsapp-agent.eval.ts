/**
 * Braintrust evaluation — WhatsApp agent.
 *
 * Run:
 *   npm run eval          (from packages/backend)
 *
 * Results appear at https://www.braintrust.dev in the project
 * "jarvi-whatsapp-agent".
 */

// dotenv MUST be the very first import so env vars are available before any
// service module loads.
import 'dotenv/config';

import fs from 'fs';
import path from 'path';
import { Eval } from 'braintrust';
import { Factuality } from 'autoevals';
import OpenAI from 'openai';
import {
  setupEvalDatabase,
  buildContext,
  seedPendingTasksForEval,
  seedTasksForEval,
} from './helpers';
import { SCENARIOS } from './datasets/whatsapp-scenarios';
import { WEB_SCENARIOS } from './datasets/web-scenarios';
import type { ChannelProfile, ToolName } from '../src/services/agent/core/types';

const ALL_SCENARIOS = [...SCENARIOS, ...WEB_SCENARIOS];

// ---------------------------------------------------------------------------
// Channel profile — full production tool set, safe against in-memory SQLite
// ---------------------------------------------------------------------------

const EVAL_WHATSAPP_PROFILE: ChannelProfile = {
  id: 'whatsapp',
  taskCreationTarget: 'pending_tasks',
  toolsAvailable: [
    'create_task',
    'update_task',
    'complete_task',
    'delete_task',
    'update_memory',
    'confirm_pending_task',
    'reject_pending_task',
    'update_pending_task',
  ] as ToolName[],
  outputFormat: 'plain',
  transport: 'single',
  enableBriefing: true,
  enableMemoryReconciliation: false,
  enableDedup: false,
  enableAntiHallucinationRetry: false,
  supportsTaskMode: false,
  // Loaded lazily below after DB is ready
  systemPromptExtras: undefined,
};

const EVAL_WEB_TASK_PROFILE: ChannelProfile = {
  id: 'web',
  taskCreationTarget: 'tasks',
  toolsAvailable: ['update_task', 'update_memory'] as ToolName[],
  outputFormat: 'markdown',
  transport: 'single',
  enableBriefing: false,
  enableMemoryReconciliation: false,
  enableDedup: false,
  enableAntiHallucinationRetry: true,
  supportsTaskMode: true,
  systemPromptExtras: undefined,
};

const EVAL_WEB_PROFILE: ChannelProfile = {
  id: 'web',
  taskCreationTarget: 'tasks',
  toolsAvailable: ['create_task', 'update_task', 'complete_task', 'delete_task', 'update_memory'] as ToolName[],
  outputFormat: 'markdown',
  transport: 'single',
  enableBriefing: false,
  enableMemoryReconciliation: false,
  enableDedup: false,
  enableAntiHallucinationRetry: true,
  supportsTaskMode: true,
  systemPromptExtras: undefined,
};

// ---------------------------------------------------------------------------
// Task function
// ---------------------------------------------------------------------------

interface CapturedToolCall {
  name: string;
  args: Record<string, unknown>;
}

const toolCallsByScenario = new Map<string, string[]>();
const toolCallDetailsByScenario = new Map<string, CapturedToolCall[]>();

function scenarioKey(input: Record<string, unknown>): string {
  return JSON.stringify(input);
}

async function runScenario(scenario: {
  input: string;
  channel?: 'whatsapp' | 'web';
  contextOverrides?: Record<string, unknown>;
}): Promise<string> {
  // Lazy-import services so they resolve AFTER setupEvalDatabase() ran
  const { buildSystemPrompt, buildTaskFocusedPrompt, buildWhatsappExtras } = await import(
    '../src/services/agent/core/prompt'
  );
  const { runAgent } = await import('../src/services/agent/core/runAgent');

  // Attach extras here since we can only import after DB init
  EVAL_WHATSAPP_PROFILE.systemPromptExtras = buildWhatsappExtras;

  const ctx = buildContext(
    scenario.contextOverrides as Parameters<typeof buildContext>[0],
  );
  ctx.originalUserMessage = scenario.input;
  await seedPendingTasksForEval(ctx.pendingTasks);
  await seedTasksForEval([
    ...(ctx.activeTasks ?? []),
    ...(ctx.focusedTask ? [ctx.focusedTask] : []),
  ]);

  const profile =
    ctx.mode === 'task' && ctx.focusedTask
      ? EVAL_WEB_TASK_PROFILE
      : scenario.channel === 'web'
        ? EVAL_WEB_PROFILE
        : EVAL_WHATSAPP_PROFILE;
  const systemPrompt =
    ctx.mode === 'task' && ctx.focusedTask
      ? buildTaskFocusedPrompt(ctx.focusedTask, ctx, profile)
      : buildSystemPrompt(ctx, profile);

  const messages = [{ role: 'user' as const, content: scenario.input }];

  const toolCallNames: string[] = [];
  const toolCallDetails: CapturedToolCall[] = [];

  const { text, toolCallNames: finalToolCallNames } = await runAgent(
    profile,
    ctx,
    systemPrompt,
    messages,
    {
      onToolCall: (name, args) => {
        toolCallNames.push(name);
        toolCallDetails.push({ name, args });
      },
    },
  );

  toolCallsByScenario.set(
    scenarioKey(scenario as unknown as Record<string, unknown>),
    finalToolCallNames.length ? finalToolCallNames : toolCallNames,
  );
  toolCallDetailsByScenario.set(
    scenarioKey(scenario as unknown as Record<string, unknown>),
    toolCallDetails,
  );

  return text || '(sem resposta)';
}

// ---------------------------------------------------------------------------
// Rule-based scorer (mustContain / mustNotContain)
// ---------------------------------------------------------------------------

function RuleChecker({
  input,
  output,
  expected,
}: {
  input: Record<string, unknown>;
  output: string;
  expected: string;
}): { name: string; score: number; metadata?: Record<string, unknown> } {
  let rules: {
    mustContain?: string[];
    mustNotContain?: string[];
    mustCallTool?: string[];
    mustNotCallTool?: string[];
    mustCallToolCount?: Record<string, number>;
    mustCallToolArgs?: Array<{ tool: string; arg: string; value: string | null }>;
    mustNotCallToolArgs?: Array<{ tool: string; arg: string; value: string | null }>;
    mustUpdateTaskIds?: string[];
    mustNotUpdateTaskIds?: string[];
  } = {};
  try {
    rules = JSON.parse(expected);
  } catch {
    return { name: 'RuleChecker', score: 1 };
  }

  const toolCallNames = toolCallsByScenario.get(scenarioKey(input)) ?? [];
  const toolCallDetails = toolCallDetailsByScenario.get(scenarioKey(input)) ?? [];
  const updatedTaskIds = toolCallDetails
    .filter((tc) => tc.name === 'update_task')
    .map((tc) => String(tc.args.task_id ?? ''))
    .filter(Boolean);
  const lower = output.toLowerCase();
  const failures: string[] = [];

  for (const must of rules.mustContain ?? []) {
    if (!lower.includes(must.toLowerCase())) {
      failures.push(`MISSING: "${must}"`);
    }
  }
  for (const mustNot of rules.mustNotContain ?? []) {
    if (lower.includes(mustNot.toLowerCase())) {
      failures.push(`UNEXPECTED: "${mustNot}"`);
    }
  }
  for (const tool of rules.mustCallTool ?? []) {
    if (!toolCallNames.includes(tool)) {
      failures.push(`MISSING_TOOL: "${tool}"`);
    }
  }
  for (const tool of rules.mustNotCallTool ?? []) {
    if (toolCallNames.includes(tool)) {
      failures.push(`UNEXPECTED_TOOL: "${tool}"`);
    }
  }
  for (const [tool, expectedCount] of Object.entries(rules.mustCallToolCount ?? {})) {
    const actualCount = toolCallNames.filter((name) => name === tool).length;
    if (actualCount !== expectedCount) {
      failures.push(`TOOL_COUNT: "${tool}" expected ${expectedCount}, got ${actualCount}`);
    }
  }
  for (const expectation of rules.mustCallToolArgs ?? []) {
    const matched = toolCallDetails.some((tc) => {
      if (tc.name !== expectation.tool) return false;
      const actualValue = tc.args[expectation.arg];
      if (expectation.value === null) return actualValue === null;
      return String(actualValue ?? '') === expectation.value;
    });
    if (!matched) {
      failures.push(
        `MISSING_TOOL_ARG: "${expectation.tool}.${expectation.arg}" expected "${expectation.value}"`,
      );
    }
  }
  for (const expectation of rules.mustNotCallToolArgs ?? []) {
    const matched = toolCallDetails.some((tc) => {
      if (tc.name !== expectation.tool) return false;
      const actualValue = tc.args[expectation.arg];
      if (expectation.value === null) return actualValue === null;
      return String(actualValue ?? '') === expectation.value;
    });
    if (matched) {
      failures.push(
        `FORBIDDEN_TOOL_ARG: "${expectation.tool}.${expectation.arg}" must not be "${expectation.value}"`,
      );
    }
  }
  for (const taskId of rules.mustUpdateTaskIds ?? []) {
    if (!updatedTaskIds.includes(taskId)) {
      failures.push(`MISSING_UPDATE_TASK_ID: "${taskId}"`);
    }
  }
  for (const taskId of rules.mustNotUpdateTaskIds ?? []) {
    if (updatedTaskIds.includes(taskId)) {
      failures.push(`UNEXPECTED_UPDATE_TASK_ID: "${taskId}"`);
    }
  }

  return {
    name: 'RuleChecker',
    score: failures.length === 0 ? 1 : 0,
    metadata: failures.length ? { failures } : undefined,
  };
}

// ---------------------------------------------------------------------------
// Satisfaction threshold — default 80%, override with EVAL_MIN_SATISFACTION
// ---------------------------------------------------------------------------

const SATISFACTION_THRESHOLD = parseFloat(process.env.EVAL_MIN_SATISFACTION ?? '0.80');

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  await setupEvalDatabase();

  const result = await Eval('jarvi-whatsapp-agent', {
    data: () =>
      ALL_SCENARIOS.map((s) => ({
        input: { input: s.input, channel: s.channel, contextOverrides: s.contextOverrides },
        expected: JSON.stringify({
          mustContain: s.mustContain,
          mustNotContain: s.mustNotContain,
          mustCallTool: s.mustCallTool,
          mustNotCallTool: s.mustNotCallTool,
          mustCallToolCount: s.mustCallToolCount,
          mustCallToolArgs: s.mustCallToolArgs,
          mustNotCallToolArgs: s.mustNotCallToolArgs,
          mustUpdateTaskIds: s.mustUpdateTaskIds,
          mustNotUpdateTaskIds: s.mustNotUpdateTaskIds,
          idealOutput: s.idealOutput,
        }),
        metadata: { name: s.name, tags: s.tags },
      })),

    task: (input) =>
      runScenario(input as Parameters<typeof runScenario>[0]),

    scores: [
      RuleChecker,

      async ({
        input,
        output,
        expected,
      }: {
        input: Record<string, unknown>;
        output: string;
        expected: string;
      }) => {
        const { idealOutput } = JSON.parse(expected) as {
          idealOutput?: string;
        };
        if (!idealOutput) return { name: 'Factuality', score: 1 };
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        return Factuality({
          input: (input as { input: string }).input,
          output,
          expected: idealOutput,
          client,
        });
      },
    ],

    metadata: {
      model: process.env.OPENAI_MODEL ?? 'gpt-4o',
      environment: process.env.NODE_ENV ?? 'development',
    },
  });

  // ── Compute satisfaction from aggregated scorer averages ─────────────────
  const summaryScores = (result as unknown as {
    summary?: { scores?: Record<string, { score: number | null }> };
  }).summary?.scores ?? {};

  const scoreEntries = Object.entries(summaryScores);
  const satisfaction =
    scoreEntries.length > 0
      ? scoreEntries.reduce((sum, [, v]) => sum + (v.score ?? 0), 0) / scoreEntries.length
      : 0;

  // ── Collect per-case failures ─────────────────────────────────────────────
  type EvalResultItem = {
    input: unknown;
    scores: Record<string, { score: number | null; metadata?: unknown } | null>;
    metadata?: unknown;
  };

  const caseResults = (result as unknown as { results?: EvalResultItem[] }).results ?? [];

  const failures: Array<{ scenario: string; scorer: string; reason: string }> = [];
  for (const r of caseResults) {
    const scenarioName =
      (r.metadata as { name?: string } | undefined)?.name ??
      String((r.input as { input?: string } | undefined)?.input ?? 'unknown').slice(0, 60);

    for (const [scorerName, score] of Object.entries(r.scores ?? {})) {
      if (score && (score.score ?? 1) < 1) {
        const reasons = ((score.metadata as { failures?: string[] } | undefined)?.failures) ?? [];
        failures.push({
          scenario: scenarioName,
          scorer: scorerName,
          reason: reasons.length > 0 ? reasons.join('; ') : `score: ${score.score}`,
        });
      }
    }
  }

  // ── Write eval-result.json ────────────────────────────────────────────────
  const summary = {
    satisfaction: Math.round(satisfaction * 100) / 100,
    scores: Object.fromEntries(
      scoreEntries.map(([k, v]) => [k, Math.round((v.score ?? 0) * 100) / 100]),
    ),
    total: ALL_SCENARIOS.length,
    failures,
  };

  const resultPath = path.resolve(__dirname, '..', 'eval-result.json');
  fs.writeFileSync(resultPath, JSON.stringify(summary, null, 2));

  // ── Console summary ───────────────────────────────────────────────────────
  const pct = Math.round(satisfaction * 100);
  const scoresDisplay = Object.entries(summary.scores)
    .map(([k, v]) => `${k}: ${Math.round(v * 100)}%`)
    .join(' | ');

  console.log(`\n[eval] satisfaction: ${pct}% (${scoresDisplay})`);
  console.log(`[eval] ${ALL_SCENARIOS.length} scenarios — ${failures.length} failure(s)`);

  if (failures.length > 0) {
    console.log('[eval] failures:');
    for (const f of failures) {
      console.log(`  - ${f.scenario} [${f.scorer}]: ${f.reason}`);
    }
  }

  // ── Gate: fail CI if below threshold ─────────────────────────────────────
  if (satisfaction < SATISFACTION_THRESHOLD) {
    console.error(
      `\n[eval] FAILED — satisfaction ${pct}% is below threshold ${Math.round(SATISFACTION_THRESHOLD * 100)}%`,
    );
    process.exit(1);
  }

  console.log(`\n[eval] PASSED — satisfaction ${pct}% >= threshold ${Math.round(SATISFACTION_THRESHOLD * 100)}%`);
}

main().catch((err) => {
  console.error('[eval] fatal error:', err);
  process.exit(1);
});
