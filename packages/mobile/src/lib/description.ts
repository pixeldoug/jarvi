/**
 * Task descriptions are either plain text or a serialized TipTap/ProseMirror
 * doc written by the web editor (possibly with embedded `_attachments`).
 * The app shows any of them as text, but only edits the ones it can write
 * back without losing formatting.
 */
import { i18n } from '@/i18n';

interface DocNode {
  type?: string;
  text?: string;
  marks?: unknown[];
  attrs?: Record<string, unknown>;
  content?: DocNode[];
}

export interface ParsedDescription {
  text: string;
  /** False when saving plain text would drop formatting or attachments. */
  editable: boolean;
  attachmentCount: number;
}

function inlineText(node: DocNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'attachmentRef') return `[${String(node.attrs?.name ?? i18n.t('tasks:description.attachment'))}]`;
  return (node.content ?? []).map(inlineText).join('');
}

function blockLines(node: DocNode, depth = 0): string[] {
  const indent = '  '.repeat(depth);
  switch (node.type) {
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return (node.content ?? []).flatMap((item, index) => {
        const marker =
          node.type === 'orderedList' ? `${index + 1}.` : node.type === 'taskList' ? (item.attrs?.checked ? '☑' : '☐') : '•';
        const [first, ...rest] = (item.content ?? []).flatMap((child) => blockLines(child, depth + 1));
        return [`${indent}${marker} ${(first ?? '').trim()}`, ...rest];
      });
    case 'paragraph':
    case 'heading':
    case 'blockquote':
    case 'codeBlock':
      return node.type === 'blockquote'
        ? (node.content ?? []).flatMap((child) => blockLines(child, depth))
        : [`${indent}${inlineText(node)}`];
    default:
      return node.content ? node.content.flatMap((child) => blockLines(child, depth)) : [inlineText(node)];
  }
}

function isPlainParagraph(node: DocNode): boolean {
  return (
    node.type === 'paragraph' &&
    (node.content ?? []).every(
      (child) => (child.type === 'text' && !child.marks?.length) || child.type === 'hardBreak',
    )
  );
}

export function parseDescription(raw?: string | null): ParsedDescription {
  const value = raw?.trim() ?? '';
  if (!value.startsWith('{')) return { text: value, editable: true, attachmentCount: 0 };

  let doc: DocNode & { _attachments?: unknown[] };
  try {
    doc = JSON.parse(value);
  } catch {
    return { text: value, editable: true, attachmentCount: 0 };
  }
  if (doc?.type !== 'doc') return { text: value, editable: true, attachmentCount: 0 };

  const blocks = doc.content ?? [];
  const attachmentCount = Array.isArray(doc._attachments) ? doc._attachments.length : 0;
  return {
    text: blocks.flatMap((block) => blockLines(block)).join('\n').trim(),
    editable: attachmentCount === 0 && blocks.every(isPlainParagraph),
    attachmentCount,
  };
}

/** Plain text → the doc shape the web editor reads (one paragraph per line). */
export function serializeDescription(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return JSON.stringify({
    type: 'doc',
    content: trimmed.split('\n').map((line) =>
      line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' },
    ),
  });
}
