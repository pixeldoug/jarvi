/**
 * Jarvi agent evaluation runner (replaces the Braintrust `Eval()` harness).
 *
 * Run:
 *   npm run eval          (from packages/backend)
 *
 * Semantics kept identical to the previous harness:
 *   - Two scorers: RuleChecker (deterministic, 0/1 per scenario) and
 *     Factuality (LLM judge vs `idealOutput`, autoevals-compatible rubric,
 *     score 1 when a scenario declares no idealOutput).
 *   - satisfaction = mean of the two scorer averages.
 *   - Writes `eval-result.json` and exits 1 below EVAL_MIN_SATISFACTION (0.80).
 *
 * New: multi-turn scenarios (`turns`) run sequentially with accumulated chat
 * history and task state refreshed between turns; every agent run emits
 * PostHog AI traces tagged `environment: 'eval'` via the runAgent
 * instrumentation.
 */

// dotenv MUST be the very first import so env vars are available before any
// service module loads.
import 'dotenv/config';

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import {
  setupEvalDatabase,
  buildContext,
  seedCategoriesForEval,
  seedTasksForEval,
} from './helpers';
import { checkRules, type CapturedToolCall, type RuleExpectations } from './ruleChecker';
import { SCENARIOS, type EvalScenario, type EvalTurn } from './datasets/whatsapp-scenarios';
import { WEB_SCENARIOS } from './datasets/web-scenarios';
import { RELIABLE_EXECUTION_SCENARIOS } from './datasets/reliable-execution-scenarios';
import { TASK_REF_REGEX } from '../src/services/agent/core/confirmations';
import type { ChannelProfile, TaskRow } from '../src/services/agent/core/types';

// EVAL_ONLY=<regex> narrows the run to matching scenario names (e.g.
// EVAL_ONLY='^reliable/' for the entrega-1 set only).
const ONLY = process.env.EVAL_ONLY ? new RegExp(process.env.EVAL_ONLY) : null;
const ALL_SCENARIOS: EvalScenario[] = [
  ...SCENARIOS,
  ...WEB_SCENARIOS,
  ...RELIABLE_EXECUTION_SCENARIOS,
].filter((s) => !ONLY || ONLY.test(s.name));

const SATISFACTION_THRESHOLD = parseFloat(process.env.EVAL_MIN_SATISFACTION ?? '0.80');
const MAX_CONCURRENCY = parseInt(process.env.EVAL_MAX_CONCURRENCY ?? '3', 10);
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? 'gpt-4o';

// Entrega 1 — A/B switch for the whole suite. Scenarios can pin their own
// value with `reliable: true|false`; unset follows this default (off).
const EVAL_RELIABLE_EXECUTION = /^(1|true|on)$/i.test(
  process.env.EVAL_RELIABLE_EXECUTION ?? '',
);

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
  // Loaded lazily after DB is ready
  systemPromptExtras: undefined,
};

// Production uses the SAME profile for both web general chat and the
// task-focused sidebar (see web.ts) — one eval profile mirrors that.
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
    'search_web',
    'offer_choices',
    'complete_onboarding_journey',
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
// Trace metadata
// ---------------------------------------------------------------------------

function getGitSha(): string {
  if (process.env.GIT_SHA) return process.env.GIT_SHA;
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

const GIT_SHA = getGitSha();

// ---------------------------------------------------------------------------
// LLM judge — minimal Factuality (same rubric/choice scores as autoevals)
// ---------------------------------------------------------------------------

const FACTUALITY_CHOICE_SCORES: Record<string, number> = {
  A: 0.4,
  B: 0.6,
  C: 1,
  D: 0,
  E: 1,
};

let judgeClient: OpenAI | null = null;
const getJudgeClient = (): OpenAI => {
  if (!judgeClient) {
    judgeClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return judgeClient;
};

interface FactualityResult {
  score: number;
  choice: string;
}

async function judgeFactuality(args: {
  input: string;
  output: string;
  expected: string;
}): Promise<FactualityResult> {
  const prompt = [
    'You are comparing a submitted answer to an expert answer on a given question. Here is the data:',
    '[BEGIN DATA]',
    '************',
    `[Question]: ${args.input}`,
    '************',
    `[Expert]: ${args.expected}`,
    '************',
    `[Submission]: ${args.output}`,
    '************',
    '[END DATA]',
    '',
    'Compare the factual content of the submitted answer with the expert answer. Ignore any differences in style, grammar, or punctuation.',
    'The submitted answer may either be a subset or superset of the expert answer, or it may conflict with it. Determine which case applies. Answer the question by selecting one of the following options:',
    '(A) The submitted answer is a subset of the expert answer and is fully consistent with it.',
    '(B) The submitted answer is a superset of the expert answer and is fully consistent with it.',
    '(C) The submitted answer contains all the same details as the expert answer.',
    '(D) There is a disagreement between the submitted answer and the expert answer.',
    '(E) The answers differ, but these differences don\'t matter from the perspective of factuality.',
    '',
    // autoevals runs this classifier with chain-of-thought; mirroring that keeps
    // scores comparable with the old Braintrust baseline.
    'First, reason step by step about which option applies.',
    'Then finish with your final answer on its own last line, in the exact format:',
    'Answer: <letter>',
  ].join('\n');

  const response = await getJudgeClient().chat.completions.create({
    model: JUDGE_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    max_tokens: 512,
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? '';
  const answerLine = /answer:\s*\(?([ABCDE])\)?/i.exec(raw);
  const choice = answerLine
    ? answerLine[1].toUpperCase()
    : (/\b([ABCDE])\b\s*$/.exec(raw.toUpperCase())?.[1] ?? '');
  const score = FACTUALITY_CHOICE_SCORES[choice];
  if (score === undefined) {
    // Unparseable judge answer — treat as disagreement, but surface it.
    return { score: 0, choice: `unparseable: "${raw}"` };
  }
  return { score, choice };
}

// ---------------------------------------------------------------------------
// Scenario execution
// ---------------------------------------------------------------------------

interface TurnResult {
  input: string;
  output: string;
  toolCalls: CapturedToolCall[];
  ruleFailures: string[];
  factuality?: FactualityResult & { idealOutput: string };
}

interface ScenarioResult {
  name: string;
  /** 1 when every turn passed every rule, else 0 (same binary semantics as before). */
  ruleScore: number;
  /** Average judge score across turns that declare idealOutput; 1 when none do. */
  factualityScore: number;
  turns: TurnResult[];
  error?: string;
}

function turnsOf(scenario: EvalScenario): EvalTurn[] {
  if (scenario.turns && scenario.turns.length > 0) return scenario.turns;
  return [
    {
      input: scenario.input ?? '',
      idealOutput: scenario.idealOutput,
      // EvalScenario extends RuleExpectations — the top-level fields ARE the
      // single turn's expectations.
      ...(scenario as RuleExpectations),
    },
  ];
}

async function runScenario(scenario: EvalScenario): Promise<ScenarioResult> {
  // Lazy-import services so they resolve AFTER setupEvalDatabase() ran
  const { buildSystemPrompt, buildTaskFocusedPrompt, buildWhatsappExtras, buildWebExtras } =
    await import('../src/services/agent/core/prompt');
  const { runAgent } = await import('../src/services/agent/core/runAgent');
  const { getTaskById } = await import('../src/services/agent/core/tasks');

  EVAL_WHATSAPP_PROFILE.systemPromptExtras = buildWhatsappExtras;
  EVAL_WEB_PROFILE.systemPromptExtras = buildWebExtras;

  const baseProfile = scenario.channel === 'web' ? EVAL_WEB_PROFILE : EVAL_WHATSAPP_PROFILE;
  const reliableExecution = scenario.reliable ?? EVAL_RELIABLE_EXECUTION;
  const nextQuestionPolicy = scenario.channel === 'web' && reliableExecution;
  const profile: ChannelProfile = {
    ...baseProfile,
    reliableExecution,
    // Mirrors web.ts: the tríade questions and the onboarding journey are the
    // system's on the web; the legacy path keeps the model-driven tool.
    enableNextQuestionPolicy: nextQuestionPolicy,
    toolsAvailable: nextQuestionPolicy
      ? baseProfile.toolsAvailable.filter((name) => name !== 'complete_onboarding_journey')
      : baseProfile.toolsAvailable,
  };
  const turns = turnsOf(scenario);

  const ctx = buildContext(
    scenario.contextOverrides as Parameters<typeof buildContext>[0],
  );
  await seedCategoriesForEval(ctx.categories);
  // `unseededTaskIds` stay in the prompt but out of the DB, so a write against
  // them must surface as `not_found` (entrega-1 failure-path scenarios).
  const unseeded = new Set(scenario.unseededTaskIds ?? []);
  await seedTasksForEval(
    [...(ctx.activeTasks ?? []), ...(ctx.focusedTask ? [ctx.focusedTask] : [])].filter(
      (t) => !unseeded.has(t.id),
    ),
  );

  // Tasks this scenario knows about: the seeded ones plus any the agent
  // creates along the way. Multi-turn scenarios refresh these from the DB
  // between turns so the system prompt reflects turn N-1's writes (mirrors
  // production, where the task list is re-fetched on every message).
  const scenarioTaskIds: string[] = (ctx.activeTasks ?? []).map((t) => t.id);

  const history: ChatCompletionMessageParam[] = [
    ...(scenario.seedHistory ?? []),
  ];
  const results: TurnResult[] = [];

  for (const [turnIndex, turn] of turns.entries()) {
    if (turnIndex > 0) {
      const refreshed: TaskRow[] = [];
      for (const taskId of scenarioTaskIds) {
        const task = await getTaskById(taskId, ctx.userId);
        if (task && !task.completed) refreshed.push(task);
      }
      ctx.activeTasks = refreshed;
      ctx.activeTaskCount = refreshed.length;
    }
    ctx.originalUserMessage = turn.input;

    const systemPrompt =
      ctx.mode === 'task' && ctx.focusedTask
        ? buildTaskFocusedPrompt(ctx.focusedTask, ctx, profile)
        : buildSystemPrompt(ctx, profile);

    const turnToolCalls: CapturedToolCall[] = [];
    const messages: ChatCompletionMessageParam[] = [
      ...history,
      { role: 'user', content: turn.input },
    ];

    const { text } = await runAgent(
      profile,
      ctx,
      systemPrompt,
      messages,
      {
        onToolCall: (name, args) => {
          turnToolCalls.push({ name, args });
        },
        onToolResult: (name, success, data) => {
          if (name === 'create_task' && success && data?.id) {
            const id = String(data.id);
            if (!scenarioTaskIds.includes(id)) scenarioTaskIds.push(id);
          }
          // Reliable execution: when the backend refused the model's due_date
          // (period without a day, past date the user never named), the rules
          // must judge what was persisted, not what the model proposed. The
          // captured call keeps the proposal under `held_due_date` for logs.
          const notes = Array.isArray(data?.notes) ? (data.notes as unknown[]) : [];
          if (success && notes.some((n) => typeof n === 'string' && n.startsWith('due_date NÃO salvo'))) {
            const captured = [...turnToolCalls].reverse().find((tc) => tc.name === name);
            if (captured && 'due_date' in captured.args) {
              captured.args = { ...captured.args, held_due_date: captured.args.due_date };
              delete captured.args.due_date;
            }
          }
        },
      },
      {
        traceProperties: {
          environment: 'eval',
          scenario: scenario.name,
          turn: turnIndex,
          git_sha: GIT_SHA,
          reliable_execution: Boolean(profile.reliableExecution),
        },
      },
    );

    // The web renders `{{task:id|Title}}` as the inline mention; for the judge
    // and the model history it is just the quoted title, like the web does
    // when it sends the history back. Rules see the RAW text so a scenario
    // can assert the mention itself (`mustContain: ['{{task:task-x|']`).
    const rawOutput = text || '(sem resposta)';
    const output = rawOutput.replace(TASK_REF_REGEX, (_m, _id, title: string) => `"${title.trim()}"`);
    history.push({ role: 'user', content: turn.input });
    history.push({ role: 'assistant', content: output });

    const ruleFailures = checkRules(turn, rawOutput, turnToolCalls).map((f) =>
      turns.length > 1 ? `turn ${turnIndex + 1}: ${f}` : f,
    );

    let factuality: TurnResult['factuality'];
    if (turn.idealOutput) {
      const judged = await judgeFactuality({
        input: turn.input,
        output,
        expected: turn.idealOutput,
      });
      factuality = { ...judged, idealOutput: turn.idealOutput };
    }

    results.push({ input: turn.input, output, toolCalls: turnToolCalls, ruleFailures, factuality });
  }

  const allRuleFailures = results.flatMap((r) => r.ruleFailures);
  const judgedTurns = results.filter((r) => r.factuality);
  const factualityScore =
    judgedTurns.length > 0
      ? judgedTurns.reduce((sum, r) => sum + (r.factuality?.score ?? 0), 0) / judgedTurns.length
      : 1;

  return {
    name: scenario.name,
    ruleScore: allRuleFailures.length === 0 ? 1 : 0,
    factualityScore,
    turns: results,
  };
}

// ---------------------------------------------------------------------------
// Concurrency pool
// ---------------------------------------------------------------------------

async function runPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  await setupEvalDatabase();

  console.log(
    `[eval] running ${ALL_SCENARIOS.length} scenarios (concurrency=${MAX_CONCURRENCY}, judge=${JUDGE_MODEL}, git_sha=${GIT_SHA}, reliable_execution=${EVAL_RELIABLE_EXECUTION ? 'on' : 'off'}${ONLY ? `, only=${ONLY.source}` : ''})`,
  );

  const startedAt = Date.now();
  const results = await runPool(ALL_SCENARIOS, MAX_CONCURRENCY, async (scenario) => {
    try {
      const result = await runScenario(scenario);
      const status = result.ruleScore === 1 && result.factualityScore === 1 ? 'ok' : 'FAIL';
      console.log(`[eval] ${status.padEnd(4)} ${scenario.name}`);
      // EVAL_VERBOSE=1 prints what the agent actually said/called on failures,
      // so a red scenario can be diagnosed without re-running it by hand.
      if (status === 'FAIL' && /^(1|true)$/i.test(process.env.EVAL_VERBOSE ?? '')) {
        for (const [i, turn] of result.turns.entries()) {
          const tools = turn.toolCalls.map((t) => `${t.name}(${JSON.stringify(t.args)})`).join(', ');
          console.log(`[eval]   turn ${i + 1} input : ${turn.input}`);
          console.log(`[eval]   turn ${i + 1} tools : ${tools || 'none'}`);
          console.log(`[eval]   turn ${i + 1} output: ${JSON.stringify(turn.output)}`);
          if (turn.ruleFailures.length) console.log(`[eval]   turn ${i + 1} rules : ${turn.ruleFailures.join('; ')}`);
        }
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[eval] ERROR ${scenario.name}: ${message}`);
      return {
        name: scenario.name,
        ruleScore: 0,
        factualityScore: 0,
        turns: [],
        error: message,
      } satisfies ScenarioResult;
    }
  });

  // ── Aggregate — same semantics as the old harness ─────────────────────────
  const ruleAvg = results.reduce((sum, r) => sum + r.ruleScore, 0) / results.length;
  const factualityAvg =
    results.reduce((sum, r) => sum + r.factualityScore, 0) / results.length;
  // Rounded to the same precision we report/persist, so the gate never fails a
  // run that displays as passing (e.g. raw 0.7996 shown as "80%").
  const satisfaction = Math.round(((ruleAvg + factualityAvg) / 2) * 100) / 100;

  const failures: Array<{ scenario: string; scorer: string; reason: string }> = [];
  for (const r of results) {
    if (r.error) {
      failures.push({ scenario: r.name, scorer: 'Runner', reason: `ERROR: ${r.error}` });
      continue;
    }
    const ruleFailures = r.turns.flatMap((t) => t.ruleFailures);
    if (ruleFailures.length > 0) {
      failures.push({ scenario: r.name, scorer: 'RuleChecker', reason: ruleFailures.join('; ') });
    }
    if (r.factualityScore < 1) {
      const reasons = r.turns
        .filter((t) => t.factuality && t.factuality.score < 1)
        .map((t) => `choice ${t.factuality?.choice} (score ${t.factuality?.score})`);
      failures.push({
        scenario: r.name,
        scorer: 'Factuality',
        reason: reasons.join('; ') || `score: ${r.factualityScore}`,
      });
    }
  }

  // ── Write eval-result.json ────────────────────────────────────────────────
  const summary = {
    satisfaction,
    scores: {
      RuleChecker: Math.round(ruleAvg * 100) / 100,
      Factuality: Math.round(factualityAvg * 100) / 100,
    },
    total: ALL_SCENARIOS.length,
    failures,
  };

  const resultPath = path.resolve(__dirname, '..', 'eval-result.json');
  fs.writeFileSync(resultPath, JSON.stringify(summary, null, 2));

  // ── Flush PostHog traces emitted during the run ───────────────────────────
  try {
    const { shutdownPostHog } = await import('../src/services/posthogService');
    await shutdownPostHog();
  } catch {
    // best-effort
  }

  // ── Console summary ───────────────────────────────────────────────────────
  const pct = Math.round(satisfaction * 100);
  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `\n[eval] satisfaction: ${pct}% (RuleChecker: ${Math.round(ruleAvg * 100)}% | Factuality: ${Math.round(factualityAvg * 100)}%)`,
  );
  console.log(`[eval] ${ALL_SCENARIOS.length} scenarios — ${failures.length} failure(s) — ${elapsed}s`);

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

  console.log(
    `\n[eval] PASSED — satisfaction ${pct}% >= threshold ${Math.round(SATISFACTION_THRESHOLD * 100)}%`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('[eval] fatal error:', err);
  process.exit(1);
});
