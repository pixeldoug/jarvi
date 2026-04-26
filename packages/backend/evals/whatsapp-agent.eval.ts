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

import { Eval } from 'braintrust';
import { Factuality } from 'autoevals';
import OpenAI from 'openai';
import {
  setupEvalDatabase,
  buildContext,
  seedPendingTasksForEval,
} from './helpers';
import { SCENARIOS } from './datasets/whatsapp-scenarios';
import type { ChannelProfile, ToolName } from '../src/services/agent/core/types';

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

// ---------------------------------------------------------------------------
// Task function
// ---------------------------------------------------------------------------

const toolCallsByScenario = new Map<string, string[]>();

function scenarioKey(input: Record<string, unknown>): string {
  return JSON.stringify(input);
}

async function runScenario(scenario: {
  input: string;
  contextOverrides?: Record<string, unknown>;
}): Promise<string> {
  // Lazy-import services so they resolve AFTER setupEvalDatabase() ran
  const { buildSystemPrompt, buildWhatsappExtras } = await import(
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

  const systemPrompt = buildSystemPrompt(ctx, EVAL_WHATSAPP_PROFILE);

  const messages = [{ role: 'user' as const, content: scenario.input }];

  const toolCallNames: string[] = [];

  const { text, toolCallNames: finalToolCallNames } = await runAgent(
    EVAL_WHATSAPP_PROFILE,
    ctx,
    systemPrompt,
    messages,
    {
      onToolCall: (name) => {
        toolCallNames.push(name);
      },
    },
  );

  toolCallsByScenario.set(
    scenarioKey(scenario as unknown as Record<string, unknown>),
    finalToolCallNames.length ? finalToolCallNames : toolCallNames,
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
  } = {};
  try {
    rules = JSON.parse(expected);
  } catch {
    return { name: 'RuleChecker', score: 1 };
  }

  const toolCallNames = toolCallsByScenario.get(scenarioKey(input)) ?? [];
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

  return {
    name: 'RuleChecker',
    score: failures.length === 0 ? 1 : 0,
    metadata: failures.length ? { failures } : undefined,
  };
}

// ---------------------------------------------------------------------------
// Entry point — wraps everything in async so DB can be awaited before Eval
// ---------------------------------------------------------------------------

async function main() {
  await setupEvalDatabase();

  await Eval('jarvi-whatsapp-agent', {
    data: () =>
      SCENARIOS.map((s) => ({
        input: { input: s.input, contextOverrides: s.contextOverrides },
        expected: JSON.stringify({
          mustContain: s.mustContain,
          mustNotContain: s.mustNotContain,
          mustCallTool: s.mustCallTool,
          mustNotCallTool: s.mustNotCallTool,
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
}

main().catch((err) => {
  console.error('[eval] fatal error:', err);
  process.exit(1);
});
