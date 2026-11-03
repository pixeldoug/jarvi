/**
 * ProseMirror (TipTap) document → Markdown / plain text.
 *
 * Reads the JSON string the web `RichTextEditor` stores (a `doc` node, plus an
 * optional top-level `_attachments` array that is ignored here). Legacy rows
 * that hold plain text instead of JSON are returned trimmed, as they are.
 *
 * Used to feed notes to the LLM (summary, chat note mode) and to compute the
 * `notes.preview` snippet. The inverse lives in `markdownToTiptapDoc.ts`.
 */

interface DocNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: { type?: string; attrs?: Record<string, unknown> }[];
}

/** `null` when `raw` is not a TipTap doc (empty, legacy plain text, garbage). */
function parseDoc(raw: string): DocNode | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && parsed.type === 'doc') return parsed as DocNode;
  } catch {
    // Not JSON — legacy plain text
  }
  return null;
}

const children = (node: DocNode): DocNode[] => (Array.isArray(node.content) ? node.content : []);

function inlineMarkdown(nodes: DocNode[]): string {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') {
      let text = node.text ?? '';
      if (!text) continue;
      const marks = new Set((node.marks ?? []).map((m) => m.type));
      if (marks.has('code')) text = `\`${text}\``;
      if (marks.has('bold')) text = `**${text}**`;
      if (marks.has('italic')) text = `*${text}*`;
      if (marks.has('strike')) text = `~~${text}~~`;
      const link = (node.marks ?? []).find((m) => m.type === 'link');
      const href = typeof link?.attrs?.href === 'string' ? link.attrs.href : '';
      if (href) text = `[${text}](${href})`;
      out += text;
    } else if (node.type === 'hardBreak') {
      out += '\n';
    } else if (node.type === 'image') {
      out += '[imagem]';
    } else if (node.type === 'attachmentRef') {
      const label = typeof node.attrs?.label === 'string' ? node.attrs.label : '';
      out += label ? `[${label}]` : '[anexo]';
    } else if (node.content) {
      out += inlineMarkdown(children(node));
    }
  }
  return out;
}

/** Prefixes the first line with `first` and continuation lines with `rest`. */
function prefixLines(text: string, first: string, rest: string): string {
  return text
    .split('\n')
    .map((line, idx) => (idx === 0 ? first : rest) + line)
    .join('\n');
}

function listItemMarkdown(item: DocNode, marker: string): string {
  const indent = ' '.repeat(marker.length);
  const body = children(item)
    .map((child) => blockMarkdown(child))
    .filter((block) => block !== '')
    .join('\n');
  // Empty items (e.g. a fresh "- [ ] ") carry nothing worth sending.
  return body ? prefixLines(body, marker, indent) : '';
}

const joinItems = (items: string[]): string => items.filter((item) => item !== '').join('\n');

function blockMarkdown(node: DocNode): string {
  switch (node.type) {
    case 'paragraph':
      return inlineMarkdown(children(node)).trim();
    case 'heading': {
      const rawLevel = Number(node.attrs?.level);
      const level = Number.isFinite(rawLevel) ? Math.min(Math.max(Math.trunc(rawLevel), 1), 6) : 1;
      const text = inlineMarkdown(children(node)).replace(/\n/g, ' ').trim();
      return text ? `${'#'.repeat(level)} ${text}` : '';
    }
    case 'bulletList':
      return joinItems(children(node).map((item) => listItemMarkdown(item, '- ')));
    case 'orderedList': {
      const rawStart = Number(node.attrs?.start);
      const start = Number.isFinite(rawStart) ? Math.trunc(rawStart) : 1;
      return joinItems(children(node).map((item, idx) => listItemMarkdown(item, `${start + idx}. `)));
    }
    case 'taskList':
      return joinItems(
        children(node).map((item) => listItemMarkdown(item, item.attrs?.checked ? '- [x] ' : '- [ ] ')),
      );
    case 'listItem':
    case 'taskItem':
      return listItemMarkdown(node, '- ');
    case 'blockquote': {
      const body = children(node)
        .map((child) => blockMarkdown(child))
        .filter((block) => block !== '')
        .join('\n\n');
      return body ? prefixLines(body, '> ', '> ') : '';
    }
    case 'codeBlock': {
      const code = children(node)
        .map((child) => child.text ?? '')
        .join('');
      const language = typeof node.attrs?.language === 'string' ? node.attrs.language : '';
      return `\`\`\`${language}\n${code}\n\`\`\``;
    }
    case 'horizontalRule':
      return '---';
    case 'image':
      return '[imagem]';
    case 'hardBreak':
      return '';
    case 'text':
      return inlineMarkdown([node]).trim();
    default:
      // Unknown block (or inline at block level): keep whatever text it has.
      return node.content ? inlineMarkdown(children(node)).trim() : '';
  }
}

/** TipTap doc JSON → Markdown. Legacy plain-text content comes back trimmed. */
export function tiptapDocToMarkdown(raw: string | null | undefined): string {
  if (!raw) return '';
  const doc = parseDoc(raw);
  if (!doc) return raw.trim();
  return children(doc)
    .map((block) => blockMarkdown(block))
    .filter((block) => block !== '')
    .join('\n\n')
    .trim();
}

function collectText(node: DocNode, parts: string[]): void {
  if (node.type === 'text') {
    if (node.text) parts.push(node.text);
    return;
  }
  if (node.type === 'hardBreak') {
    parts.push(' ');
    return;
  }
  if (node.type === 'image') return;
  const kids = children(node);
  kids.forEach((child) => collectText(child, parts));
  // Block boundaries become spaces so words from adjacent blocks never merge.
  if (kids.length > 0) parts.push(' ');
}

/**
 * TipTap doc JSON → single-line plain text (whitespace collapsed). With
 * `maxChars`, the result is cut at a word boundary and ends with "…" (the
 * ellipsis counts toward the limit).
 */
export function tiptapDocToPlainText(raw: string | null | undefined, maxChars?: number): string {
  if (!raw) return '';
  const doc = parseDoc(raw);
  let text: string;
  if (doc) {
    const parts: string[] = [];
    collectText(doc, parts);
    text = parts.join('');
  } else {
    text = raw;
  }
  text = text.replace(/\s+/g, ' ').trim();

  if (maxChars === undefined || maxChars <= 0 || text.length <= maxChars) return text;
  if (maxChars === 1) return '…';
  const cut = text.slice(0, maxChars - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace >= Math.floor((maxChars - 1) * 0.6) ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}
