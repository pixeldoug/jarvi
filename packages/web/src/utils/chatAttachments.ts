import type { ChatAttachment } from '../hooks/useChatStream';
import { markdownToTiptapDoc } from './markdownToTiptapDoc';

/** Max number of files that can ride along with a single chat message. */
export const MAX_CHAT_ATTACHMENTS = 6;
/** Max size per file (kept in sync with the backend cap). */
export const MAX_CHAT_FILE_BYTES = 8 * 1024 * 1024; // 8 MB

/** Attachment held in component state before being sent (carries UI metadata). */
export interface PendingAttachment extends ChatAttachment {
  id: string;
  size: number;
}

/** Reads a File into base64, stripping the `data:<mime>;base64,` prefix. */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Converts dropped/pasted/picked files into `PendingAttachment`s, skipping any
 * that exceed the per-file size cap.
 */
export async function filesToPendingAttachments(
  files: File[],
): Promise<PendingAttachment[]> {
  const accepted = files.filter((f) => f.size <= MAX_CHAT_FILE_BYTES);
  if (!accepted.length) return [];

  return Promise.all(
    accepted.map(async (file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      data: await readFileAsBase64(file),
    })),
  );
}

/** Strips the UI-only fields, leaving the payload the backend expects. */
export function toChatAttachmentPayload(
  attachments: PendingAttachment[],
): ChatAttachment[] {
  return attachments.map(({ name, mimeType, data }) => ({ name, mimeType, data }));
}

/** Shape the RichTextEditor persists under `doc._attachments`. */
interface SerializedTaskAttachment {
  id: string;
  name: string;
  ext: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  previewData: string;
}

/** Splits "image.png" → { base: "image", ext: ".png" }. */
function splitFileName(fileName: string): { base: string; ext: string } {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return { base: fileName, ext: '' };
  return { base: fileName.slice(0, dot), ext: fileName.slice(dot) };
}

/** Approximate byte size of a base64 string (no `data:` prefix). */
function base64ByteSize(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

/** Wraps plain text into a minimal ProseMirror doc the editor can render. */
function textToDoc(text: string): Record<string, unknown> {
  if (!text) return { type: 'doc', content: [] };
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

/**
 * Inline token the AI can place in a description to reference an attachment,
 * e.g. "divulgar a música mostrada em {{anexo}}" or "{{anexo:2}}" (1-based).
 */
const ATTACHMENT_TOKEN_RE = /\{\{\s*anexo(?:\s*:\s*(\d+))?\s*\}\}/gi;

function attachmentLabel(a: SerializedTaskAttachment): string {
  return `${a.name}${a.ext || ''}`;
}

type DocNode = Record<string, unknown>;

/** Splits a single text node on attachment tokens, emitting `attachmentRef` nodes. */
function splitTextNodeOnTokens(
  textNode: DocNode,
  attachments: SerializedTaskAttachment[],
): DocNode[] {
  const text = typeof textNode.text === 'string' ? textNode.text : '';
  const re = new RegExp(ATTACHMENT_TOKEN_RE.source, 'gi');
  const out: DocNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    if (before) out.push({ ...textNode, text: before });

    const index = match[1] ? parseInt(match[1], 10) : 1;
    const att = attachments[index - 1];
    if (att) {
      out.push({
        type: 'attachmentRef',
        attrs: { attachmentId: att.id, label: attachmentLabel(att) },
      });
    }
    // Unresolved tokens are dropped (never shown as literal "{{anexo}}").
    lastIndex = match.index + match[0].length;
  }

  const after = text.slice(lastIndex);
  if (after) out.push({ ...textNode, text: after });

  return out.length > 0 ? out : [textNode];
}

/** Recursively replaces attachment tokens in text nodes with `attachmentRef` nodes. */
function linkInlineAttachmentTokens(
  node: DocNode,
  attachments: SerializedTaskAttachment[],
): DocNode {
  const content = node.content;
  if (!Array.isArray(content)) return node;

  const newContent: DocNode[] = [];
  for (const child of content as DocNode[]) {
    if (
      child.type === 'text' &&
      typeof child.text === 'string' &&
      child.text.includes('{{')
    ) {
      newContent.push(...splitTextNodeOnTokens(child, attachments));
    } else {
      newContent.push(linkInlineAttachmentTokens(child, attachments));
    }
  }
  return { ...node, content: newContent };
}

/** Converts a single chat attachment into the editor's serialized form. */
function serializeChatAttachment(a: ChatAttachment): SerializedTaskAttachment {
  const { base, ext } = splitFileName(a.name);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: base,
    ext,
    mimeType: a.mimeType,
    size: base64ByteSize(a.data),
    uploadedAt: new Date().toISOString(),
    previewData: `data:${a.mimeType};base64,${a.data}`,
  };
}

/**
 * Merges chat attachments into a task `description`, preserving any existing
 * content and attachments. The result is a serialized ProseMirror doc string
 * (the same format the RichTextEditor reads), so the files show up in the task
 * details. Accepts legacy plain-text or empty descriptions.
 */
export function mergeAttachmentsIntoDescription(
  rawDescription: string | null | undefined,
  attachments: ChatAttachment[],
): string {
  let doc: Record<string, unknown> = { type: 'doc', content: [] };
  let existing: SerializedTaskAttachment[] = [];

  const raw = (rawDescription ?? '').trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.type === 'doc') {
        const { _attachments, ...rest } = parsed as Record<string, unknown>;
        doc = rest as Record<string, unknown>;
        existing = Array.isArray(_attachments) ? (_attachments as SerializedTaskAttachment[]) : [];
      } else {
        doc = textToDoc(raw);
      }
    } catch {
      doc = textToDoc(raw);
    }
  }

  const serialized = attachments.map(serializeChatAttachment);

  return JSON.stringify({ ...doc, _attachments: [...existing, ...serialized] });
}

/**
 * Builds the `description` for a task created by the AI: turns the agent's
 * Markdown into a structured ProseMirror doc and embeds any chat attachments
 * (so the files show up in the task details). Accepts an empty description as
 * long as there are attachments. If the description is already a serialized
 * doc, it's preserved as-is.
 */
export function buildAiTaskDescription(
  markdownDescription: string | null | undefined,
  attachments: ChatAttachment[],
): string {
  const raw = (markdownDescription ?? '').trim();
  let doc: Record<string, unknown> = { type: 'doc', content: [] };
  let existing: SerializedTaskAttachment[] = [];

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.type === 'doc') {
        const { _attachments, ...rest } = parsed as Record<string, unknown>;
        doc = rest as Record<string, unknown>;
        existing = Array.isArray(_attachments) ? (_attachments as SerializedTaskAttachment[]) : [];
      } else {
        doc = markdownToTiptapDoc(raw) as unknown as Record<string, unknown>;
      }
    } catch {
      doc = markdownToTiptapDoc(raw) as unknown as Record<string, unknown>;
    }
  }

  const serialized = [...existing, ...attachments.map(serializeChatAttachment)];
  // Turn any inline {{anexo}} tokens the AI wrote into clickable ref nodes that
  // point at the freshly-serialized attachments (also strips unresolved tokens).
  const linkedDoc = linkInlineAttachmentTokens(doc, serialized);
  const result: Record<string, unknown> = { ...linkedDoc };
  if (serialized.length > 0) result._attachments = serialized;
  return JSON.stringify(result);
}
