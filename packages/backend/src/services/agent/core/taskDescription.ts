/**
 * Task description parsing.
 *
 * A task `description` may be plain text (legacy) or a serialized ProseMirror
 * doc produced by the web RichTextEditor. The doc form can carry binary
 * attachments inline as base64 data URLs under `_attachments[].previewData`.
 *
 * Sending that base64 verbatim into the LLM prompt is what blew past the
 * provider's token-per-minute limit (a single ~870 KB image ≈ 290k tokens of
 * useless text). This module extracts ONLY the human-readable text and the
 * image attachments separately, so callers can:
 *   - feed the text into the prompt, and
 *   - pass images through the proper multimodal `image_url` channel (where the
 *     model actually "sees" them at a bounded token cost).
 */

export interface TaskImageAttachment {
  /** Display label, e.g. "image.png". */
  name: string;
  mimeType: string;
  /** Full data URL (`data:image/png;base64,...`) ready for `image_url.url`. */
  dataUrl: string;
}

export interface ParsedTaskDescription {
  /** Human-readable text, never containing base64 blobs. */
  text: string;
  /** Image attachments suitable for multimodal vision input. */
  images: TaskImageAttachment[];
  /** Labels of non-image attachments (PDFs, audio, etc.). */
  otherAttachmentLabels: string[];
}

/** Cap the number of images forwarded to the model to bound cost/latency. */
const MAX_TASK_IMAGES = 6;
/** Skip absurdly large data URLs (~11 MB binary) defensively. */
const MAX_DATA_URL_CHARS = 15_000_000;

const DATA_URL_RE = /^data:[^;,]+(;base64)?,/i;

const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'listItem',
  'taskItem',
  'codeBlock',
  'horizontalRule',
]);

interface ProseMirrorNode {
  type?: string;
  text?: string;
  content?: unknown[];
}

function collectText(node: unknown, acc: string[]): void {
  if (!node || typeof node !== 'object') return;
  const n = node as ProseMirrorNode;

  if (n.type === 'text' && typeof n.text === 'string') {
    acc.push(n.text);
    return;
  }

  if (Array.isArray(n.content)) {
    for (const child of n.content) collectText(child, acc);
  }

  // Add a line break after block-level nodes so paragraphs stay separated.
  if (typeof n.type === 'string' && BLOCK_TYPES.has(n.type)) {
    acc.push('\n');
  }
}

function normalizeText(value: string): string {
  return value
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * Parse a task description into clean text + separated image attachments.
 * Never throws; falls back to treating the input as plain text.
 */
export function parseTaskDescription(
  raw: string | null | undefined,
): ParsedTaskDescription {
  const empty: ParsedTaskDescription = {
    text: '',
    images: [],
    otherAttachmentLabels: [],
  };

  if (!raw || typeof raw !== 'string') return empty;
  const trimmed = raw.trim();
  if (!trimmed) return empty;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Legacy plain-text description.
    return { text: trimmed, images: [], otherAttachmentLabels: [] };
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as { type?: string }).type !== 'doc'
  ) {
    // Some other JSON shape — keep it as text rather than risk dumping blobs.
    return { text: trimmed, images: [], otherAttachmentLabels: [] };
  }

  const doc = parsed as { content?: unknown[]; _attachments?: unknown[] };

  const textAcc: string[] = [];
  if (Array.isArray(doc.content)) {
    for (const node of doc.content) collectText(node, textAcc);
  }
  const text = normalizeText(textAcc.join(''));

  const images: TaskImageAttachment[] = [];
  const otherAttachmentLabels: string[] = [];

  const attachments = Array.isArray(doc._attachments) ? doc._attachments : [];
  for (const a of attachments) {
    if (!a || typeof a !== 'object') continue;
    const att = a as {
      name?: string;
      ext?: string;
      mimeType?: string;
      previewData?: string;
    };
    const mimeType = (att.mimeType || '').toLowerCase();
    const label = `${att.name ?? 'arquivo'}${att.ext ?? ''}`;

    const isImage =
      mimeType.startsWith('image/') &&
      typeof att.previewData === 'string' &&
      DATA_URL_RE.test(att.previewData) &&
      att.previewData.length <= MAX_DATA_URL_CHARS;

    if (isImage && images.length < MAX_TASK_IMAGES) {
      images.push({ name: label, mimeType, dataUrl: att.previewData as string });
    } else {
      otherAttachmentLabels.push(label);
    }
  }

  return { text, images, otherAttachmentLabels };
}

/**
 * Build a short, base64-free summary of a description for inclusion in text
 * prompts (task lists, focused-task prompt). Returns `null` when there's
 * nothing meaningful to show.
 */
export function summarizeTaskDescription(
  raw: string | null | undefined,
): string | null {
  const { text, images, otherAttachmentLabels } = parseTaskDescription(raw);
  if (text) return text;

  const labels = [...images.map((i) => i.name), ...otherAttachmentLabels];
  if (labels.length > 0) return `[anexos: ${labels.join(', ')}]`;

  return null;
}
