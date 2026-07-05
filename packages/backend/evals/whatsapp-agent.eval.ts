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
  seedCategoriesForEval,
  seedTasksForEval,
} from './helpers';
import { SCENARIOS } from './datasets/whatsapp-scenarios';
import { WEB_SCENARIOS } from './datasets/web-scenarios';
import type { ChannelProfile } from '../src/services/agent/core/types';

const ALL_SCENARIOS = [...SCENARIOS, ...WEB_SCENARIOS];

// ---------------------------------------------------------------------------
// Channel profiles — mirror production exactly (`whatsapp.ts` / `web.ts`),
// except `transport` which stays 'single' for both since the eval harness
// doesn't consume an SSE stream. Any other divergence from production here
// defeats the purpose of the eval: it would validate behavior nobody ships.
// ---------------------------------------------------------------------------

const EVAL_WHATSAPP_PROFILE: ChannelProfile = {
  id: 'whatsapp',
  taskCreationTarget: 'tasks',
  toolsAvailable: [
    'create_task',
    'update_task',
    'complete_task',
    'delete_task',
    'search_tasks',
    'update_memory',
  ],
  outputFormat: 'plain',
  transport: 'single',
  enableBriefing: true,
  enableMemoryReconciliation: false,
  enableDedup: true,
  enableAntiHallucinationRetry: true,
  supportsTaskMode: false,
  // Loaded lazily below after DB is ready
  systemPromptExtras: undefined,
};

// Production uses the SAME profile for both web general chat and the
// task-focused sidebar (see web.ts: buildTaskFocusedPrompt/buildSystemPrompt
// are both called with `WEB_PROFILE`) — one eval profile mirrors that.
const EVAL_WEB_PROFILE: ChannelProfile = {
  id: 'web',
  taskCreationTarget: 'tasks',
  toolsAvailable: [
    'create_task',
    'update_task',
    'complete_task',
    'delete_task',
    'search_tasks',
    'update_memory',
    'create_list',
    'update_list',
    'delete_list',
    'show_list',
    'create_category',
    'update_category',
    'delete_category',
    'show_category',
    'scan_gmail',
  ],
  outputFormat: 'markdown',
  transport: 'single',
  enableBriefing: false,
  enableMemoryReconciliation: true,
  enableDedup: true,
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
// RuleChecker's specific failure reasons (e.g. "MISSING: ...", "UNEXPECTED_TOOL: ...").
// Braintrust's local EvalResult only exposes the final numeric score per scorer
// (`scores: Record<string, number | null>`) — the rich `metadata` a scorer
// returns is not preserved on the object `Eval()` gives back locally, only
// shipped to the remote UI. So RuleChecker stores its own reasons here,
// keyed the same way, for the local failure summary below to read back.
const ruleFailuresByScenario = new Map<string, string[]>();

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
  await seedCategoriesForEval(ctx.categories);
  await seedTasksForEval([
    ...(ctx.activeTasks ?? []),
    ...(ctx.focusedTask ? [ctx.focusedTask] : []),
  ]);

  const profile = scenario.channel === 'web' ? EVAL_WEB_PROFILE : EVAL_WHATSAPP_PROFILE;
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

  ruleFailuresByScenario.set(scenarioKey(input), failures);

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

    // Throttle parallel scenarios so the agent runs + the Factuality grader
    // calls don't burst past the OpenAI TPM limit (which produced flaky 429s).
    // Override with EVAL_MAX_CONCURRENCY if a higher tier allows more.
    maxConcurrency: parseInt(process.env.EVAL_MAX_CONCURRENCY ?? '3', 10),
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
  // NOTE: `EvalResult.scores` from the `braintrust` SDK is a plain
  // `Record<string, number | null>` — just the final numeric score per
  // scorer, not an object with `.score`/`.metadata`. The detailed reasons a
  // scorer computes (e.g. RuleChecker's `metadata.failures`) are shipped to
  // the remote Braintrust UI but not returned on this local object, so
  // RuleChecker mirrors its own reasons into `ruleFailuresByScenario` above
  // for us to read back here.
  type EvalResultItem = {
    input: unknown;
    scores: Record<string, number | null>;
    metadata?: unknown;
  };

  const caseResults = (result as unknown as { results?: EvalResultItem[] }).results ?? [];

  const failures: Array<{ scenario: string; scorer: string; reason: string }> = [];
  for (const r of caseResults) {
    const scenarioName =
      (r.metadata as { name?: string } | undefined)?.name ??
      String((r.input as { input?: string } | undefined)?.input ?? 'unknown').slice(0, 60);

    for (const [scorerName, score] of Object.entries(r.scores ?? {})) {
      if (score !== null && score < 1) {
        const reasons =
          scorerName === 'RuleChecker'
            ? ruleFailuresByScenario.get(scenarioKey(r.input as Record<string, unknown>)) ?? []
            : [];
        failures.push({
          scenario: scenarioName,
          scorer: scorerName,
          reason: reasons.length > 0 ? reasons.join('; ') : `score: ${score}`,
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
