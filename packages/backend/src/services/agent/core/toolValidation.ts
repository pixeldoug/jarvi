/**
 * Server-side validation of tool arguments against the tool's own JSON schema.
 *
 * The model is not trusted to send well-formed arguments. Before any executor
 * runs, arguments are checked against the subset of JSON Schema the tool
 * definitions in `tools.ts` use (type / enum / required / anyOf-null / pattern /
 * array items / nested object properties). Invalid arguments produce a
 * structured error and NO write happens.
 *
 * Tri-state semantics for update tools are preserved here, not in the
 * executors:
 *   - key absent            → keep the current value
 *   - explicit JSON `null`  → clear the field
 *   - a value               → set the field
 * Empty strings and the literal strings "null"/"undefined" are NOT a clear
 * request — they are what a model emits when it has nothing to say about the
 * field. They are dropped (→ keep) and reported in `ignored`, instead of being
 * silently converted into a destructive `null`.
 */

import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  /** Arguments after normalization — unknown keys removed, empty strings dropped. */
  args: Record<string, unknown>;
  issues: ValidationIssue[];
  /** Keys that were present but dropped without failing validation (kept as-is server-side). */
  ignored: string[];
}

type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  pattern?: string;
  additionalProperties?: boolean;
  description?: string;
};

const EMPTY_STRING_SENTINELS = new Set(['', 'null', 'undefined']);

function isNullable(schema: JsonSchema): boolean {
  if (Array.isArray(schema.type)) return schema.type.includes('null');
  if (schema.type === 'null') return true;
  return (schema.anyOf ?? []).some((s) => s.type === 'null');
}

function typeMatches(type: string, value: unknown): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
    case 'integer':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'null':
      return value === null;
    default:
      return true;
  }
}

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Validate `value` against `schema`, pushing issues. Returns the (possibly
 * normalized) value to keep, or the `DROP` sentinel when the key should be
 * removed (empty-string-as-absent).
 */
const DROP = Symbol('drop');

function validateValue(
  schema: JsonSchema,
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  ignored: string[],
): unknown | typeof DROP {
  // anyOf: accept the first branch that validates; report if none does.
  if (schema.anyOf && schema.anyOf.length > 0) {
    if (value === null && isNullable(schema)) return null;
    let lastTrial: ValidationIssue[] = [];
    for (const branch of schema.anyOf) {
      if (branch.type === 'null') continue;
      const trial: ValidationIssue[] = [];
      const out = validateValue(branch, value, path, trial, ignored);
      if (trial.length === 0) return out;
      lastTrial = trial;
    }
    issues.push(
      ...(lastTrial.length > 0
        ? lastTrial
        : [{ path, message: `valor inválido (${describeType(value)})` }]),
    );
    return value;
  }

  if (value === null) {
    if (isNullable(schema)) return null;
    issues.push({ path, message: 'null não é permitido neste campo' });
    return value;
  }

  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];

  // Empty-string sentinels on string-typed fields mean "nothing to say" —
  // never a clear request. Drop the key so the executor keeps the field.
  if (
    typeof value === 'string' &&
    types.includes('string') &&
    EMPTY_STRING_SENTINELS.has(value.trim().toLowerCase())
  ) {
    ignored.push(path);
    return DROP;
  }

  if (types.length > 0 && !types.some((t) => typeMatches(t, value))) {
    issues.push({
      path,
      message: `esperado ${types.join(' | ')}, recebido ${describeType(value)}`,
    });
    return value;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    issues.push({
      path,
      message: `valor "${String(value)}" fora das opções (${schema.enum.map(String).join(', ')})`,
    });
    return value;
  }

  if (schema.pattern && typeof value === 'string') {
    const re = new RegExp(schema.pattern);
    const trimmed = value.trim();
    if (!re.test(trimmed)) {
      issues.push({ path, message: `formato inválido: "${value}"` });
      return value;
    }
    return trimmed;
  }

  if (types.includes('array') && Array.isArray(value)) {
    if (!schema.items) return value;
    const itemsSchema = schema.items;
    const out: unknown[] = [];
    value.forEach((item, index) => {
      const v = validateValue(itemsSchema, item, `${path}[${index}]`, issues, ignored);
      if (v !== DROP) out.push(v);
    });
    return out;
  }

  if (types.includes('object') && typeof value === 'object' && value !== null) {
    if (!schema.properties) return value;
    return validateObject(schema, value as Record<string, unknown>, path, issues, ignored);
  }

  return value;
}

function validateObject(
  schema: JsonSchema,
  input: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
  ignored: string[],
): Record<string, unknown> {
  const properties = schema.properties ?? {};
  const out: Record<string, unknown> = {};
  const prefix = path ? `${path}.` : '';

  for (const [key, raw] of Object.entries(input)) {
    const propSchema = properties[key];
    if (!propSchema) {
      // Unknown keys are dropped (and reported) rather than failing the call:
      // models occasionally add plausible-but-unsupported fields, and refusing
      // the whole write for that would be worse than ignoring the extra.
      if (schema.additionalProperties === false) ignored.push(`${prefix}${key}`);
      else out[key] = raw;
      continue;
    }
    if (raw === undefined) continue;
    const v = validateValue(propSchema, raw, `${prefix}${key}`, issues, ignored);
    if (v !== DROP) out[key] = v;
  }

  for (const req of schema.required ?? []) {
    if (out[req] === undefined || out[req] === null) {
      issues.push({ path: `${prefix}${req}`, message: 'campo obrigatório ausente' });
    }
  }

  return out;
}

/**
 * Validate the model's arguments for `tool`. Never throws.
 */
export function validateToolArguments(
  tool: ChatCompletionTool | undefined,
  args: Record<string, unknown>,
): ValidationResult {
  if (!tool || tool.type !== 'function') {
    return {
      ok: false,
      args,
      issues: [{ path: '', message: 'ferramenta desconhecida' }],
      ignored: [],
    };
  }

  const schema = (tool.function.parameters ?? { type: 'object' }) as JsonSchema;
  const issues: ValidationIssue[] = [];
  const ignored: string[] = [];
  const normalized = validateObject(schema, args, '', issues, ignored);

  return { ok: issues.length === 0, args: normalized, issues, ignored };
}

export function formatValidationIssues(issues: ValidationIssue[]): string {
  return issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join('; ');
}
