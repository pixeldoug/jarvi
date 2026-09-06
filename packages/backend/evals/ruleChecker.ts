/**
 * Rule-based assertions shared by the eval runner and the scenario datasets.
 *
 * Extracted from the old Braintrust entry point (`whatsapp-agent.eval.ts`) so
 * the deterministic checks live in one place: `checkRules` returns the list of
 * failure reasons (empty = pass) for a single agent turn.
 */

export interface CapturedToolCall {
  name: string;
  args: Record<string, unknown>;
}

/** Deterministic expectations a scenario (or a single turn) can declare. */
export interface RuleExpectations {
  /** Strings that MUST appear in the response (case-insensitive). */
  mustContain?: string[];
  /** Strings that must NOT appear in the response (case-insensitive). */
  mustNotContain?: string[];
  /** Tools that MUST be called during the turn. */
  mustCallTool?: string[];
  /** Tools that must NOT be called during the turn. */
  mustNotCallTool?: string[];
  /** Exact number of times a tool must be called. */
  mustCallToolCount?: Record<string, number>;
  /** Tool argument expectations. At least one call to tool must include arg === value. */
  mustCallToolArgs?: Array<{ tool: string; arg: string; value: string | null }>;
  /** Tool argument exclusions. No call to tool must include arg === value. */
  mustNotCallToolArgs?: Array<{ tool: string; arg: string; value: string | null }>;
  /** Task IDs that must be updated via update_task. */
  mustUpdateTaskIds?: string[];
  /** Task IDs that must not be updated via update_task. */
  mustNotUpdateTaskIds?: string[];
}

/**
 * Checks a turn's output + tool calls against the expectations. Returns the
 * failure reasons — an empty array means the turn passed every rule.
 */
export function checkRules(
  rules: RuleExpectations,
  output: string,
  toolCalls: CapturedToolCall[],
): string[] {
  const toolCallNames = toolCalls.map((tc) => tc.name);
  const updatedTaskIds = toolCalls
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
    const matched = toolCalls.some((tc) => {
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
    const matched = toolCalls.some((tc) => {
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

  return failures;
}
