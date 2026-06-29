/**
 * Minimal Markdown → ProseMirror (TipTap) document converter.
 *
 * The AI agent returns task descriptions as Markdown. The task `description`
 * field is rendered by the `RichTextEditor`, which only renders structure when
 * the content is a ProseMirror doc (a plain string is treated as text/HTML, so
 * `##`, `-`, `- [ ]` would show up literally). This converter maps the common
 * Markdown subset the agent produces onto the editor's schema (StarterKit +
 * TaskList/TaskItem) so AI-created tasks render with real headings, lists and
 * checklists — similar to the structured descriptions seen in tools like Linear.
 *
 * Intentionally focused (not a full CommonMark parser): headings, bullet /
 * ordered lists, task checklists, blockquotes, bold / italic / inline code.
 */

export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: { type: string }[];
}

export interface PMDoc {
  type: 'doc';
  content: PMNode[];
}

const INLINE_TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

/** Parses inline marks (bold, italic, code) within a single line of text. */
function parseInline(text: string): PMNode[] {
  if (!text) return [];
  const parts = text.split(INLINE_TOKEN).filter((s) => s !== '' && s !== undefined);
  const nodes: PMNode[] = [];

  for (const part of parts) {
    if (part.length >= 4 && part.startsWith('**') && part.endsWith('**')) {
      nodes.push({ type: 'text', text: part.slice(2, -2), marks: [{ type: 'bold' }] });
    } else if (part.length >= 2 && part.startsWith('`') && part.endsWith('`')) {
      nodes.push({ type: 'text', text: part.slice(1, -1), marks: [{ type: 'code' }] });
    } else if (
      part.length >= 2 &&
      ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_')))
    ) {
      nodes.push({ type: 'text', text: part.slice(1, -1), marks: [{ type: 'italic' }] });
    } else {
      nodes.push({ type: 'text', text: part });
    }
  }

  // ProseMirror disallows empty text nodes.
  return nodes.filter((n) => n.type !== 'text' || (n.text && n.text.length > 0));
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const TASK_RE = /^[-*+]\s+\[([ xX])\]\s+(.*)$/;
const BULLET_RE = /^[-*+]\s+(.*)$/;
const ORDERED_RE = /^\d+[.)]\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;

const isHeading = (l: string) => HEADING_RE.test(l);
const isTask = (l: string) => TASK_RE.test(l);
const isBullet = (l: string) => BULLET_RE.test(l) && !isTask(l);
const isOrdered = (l: string) => ORDERED_RE.test(l);
const isQuote = (l: string) => QUOTE_RE.test(l);

function paragraph(text: string): PMNode {
  return { type: 'paragraph', content: parseInline(text) };
}

/** Converts a Markdown string into a ProseMirror doc compatible with the editor. */
export function markdownToTiptapDoc(markdown: string): PMDoc {
  const lines = (markdown ?? '').replace(/\r\n/g, '\n').split('\n');
  const content: PMNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      i++;
      continue;
    }

    const heading = HEADING_RE.exec(trimmed);
    if (heading) {
      content.push({
        type: 'heading',
        attrs: { level: heading[1].length },
        content: parseInline(heading[2]),
      });
      i++;
      continue;
    }

    if (isTask(trimmed)) {
      const items: PMNode[] = [];
      while (i < lines.length && isTask(lines[i].trim())) {
        const m = TASK_RE.exec(lines[i].trim())!;
        items.push({
          type: 'taskItem',
          attrs: { checked: m[1].toLowerCase() === 'x' },
          content: [paragraph(m[2])],
        });
        i++;
      }
      content.push({ type: 'taskList', content: items });
      continue;
    }

    if (isBullet(trimmed)) {
      const items: PMNode[] = [];
      while (i < lines.length && isBullet(lines[i].trim())) {
        const m = BULLET_RE.exec(lines[i].trim())!;
        items.push({ type: 'listItem', content: [paragraph(m[1])] });
        i++;
      }
      content.push({ type: 'bulletList', content: items });
      continue;
    }

    if (isOrdered(trimmed)) {
      const items: PMNode[] = [];
      while (i < lines.length && isOrdered(lines[i].trim())) {
        const m = ORDERED_RE.exec(lines[i].trim())!;
        items.push({ type: 'listItem', content: [paragraph(m[1])] });
        i++;
      }
      content.push({ type: 'orderedList', content: items });
      continue;
    }

    if (isQuote(trimmed)) {
      const quoteLines: string[] = [];
      while (i < lines.length && isQuote(lines[i].trim())) {
        quoteLines.push(QUOTE_RE.exec(lines[i].trim())![1]);
        i++;
      }
      content.push({ type: 'blockquote', content: [paragraph(quoteLines.join(' '))] });
      continue;
    }

    // Plain paragraph: gather consecutive non-structural lines, joined by
    // hard breaks so multi-line paragraphs keep their layout.
    const paraLines: string[] = [];
    while (i < lines.length) {
      const t = lines[i].trim();
      if (t === '' || isHeading(t) || isBullet(t) || isTask(t) || isOrdered(t) || isQuote(t)) break;
      paraLines.push(t);
      i++;
    }
    const inline: PMNode[] = [];
    paraLines.forEach((pl, idx) => {
      if (idx > 0) inline.push({ type: 'hardBreak' });
      inline.push(...parseInline(pl));
    });
    content.push({ type: 'paragraph', content: inline });
  }

  if (content.length === 0) content.push({ type: 'paragraph' });
  return { type: 'doc', content };
}
