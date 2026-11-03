/**
 * Editor AI actions ("Melhorar" in the floating toolbar): rewrite the current
 * selection with the backend (`POST /api/ai/rewrite`) and swap it in place.
 *
 * The selection goes out as a TipTap doc and comes back as Markdown, so
 * headings, lists, checklists, bold / italic / strike and links survive. Nodes
 * that cannot round-trip through Markdown (images, attachments, code blocks,
 * dividers) make the selection unsupported, so the AI never drops them.
 * Task items linked to a task (`taskId`, a note summary's converted next
 * steps) keep their link: the rewritten items take it by position.
 */

import type { Editor, JSONContent } from '@tiptap/react';
import type { Node as PMNode } from '@tiptap/pm/model';
import { aiApi, type TextRewriteAction } from '../../../lib/aiApi';
import { ApiError } from '../../../lib/apiClient';
import { markdownToTiptapDoc } from '../../../utils/markdownToTiptapDoc';

export const AI_REWRITE_ACTIONS: ReadonlyArray<{ action: TextRewriteAction; label: string }> = [
  { action: 'grammar', label: 'Corrigir gramática' },
  { action: 'improve', label: 'Melhorar escrita' },
  { action: 'shorten', label: 'Encurtar' },
  { action: 'expand', label: 'Expandir' },
];

const UNSUPPORTED_NODES = new Set(['image', 'attachmentRef', 'codeBlock', 'horizontalRule']);

/** Why the AI actions are off for the current selection, or null when they can run. */
export function aiRewriteUnavailableReason(editor: Editor): string | null {
  const { from, to, empty } = editor.state.selection;
  if (empty) return 'Selecione um trecho de texto';
  let unsupported = false;
  let hasText = false;
  editor.state.doc.nodesBetween(from, to, (node: PMNode) => {
    if (UNSUPPORTED_NODES.has(node.type.name)) unsupported = true;
    if (node.isText && node.text?.trim()) hasText = true;
    return !unsupported;
  });
  if (unsupported) return 'A IA funciona só com texto: tire imagens, anexos e código da seleção';
  if (!hasText) return 'Selecione um trecho de texto';
  return null;
}

/** Task items the range touches, in document order. */
function taskItemsBetween(doc: PMNode, from: number, to: number): PMNode[] {
  const items: PMNode[] = [];
  doc.nodesBetween(from, to, (node: PMNode) => {
    if (node.type.name === 'taskItem') items.push(node);
    return true;
  });
  return items;
}

/** Task items of JSON blocks, in document order. */
function jsonTaskItems(nodes: JSONContent[], out: JSONContent[] = []): JSONContent[] {
  nodes.forEach((node) => {
    if (node.type === 'taskItem') out.push(node);
    if (node.content) jsonTaskItems(node.content, out);
  });
  return out;
}

const LINK_PLACEHOLDER = '__ai-rewrite-link-';

export type AiRewriteOutcome =
  | { ok: true }
  | { ok: false; message: string };

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 413) return 'O trecho é longo demais. Selecione uma parte menor.';
    if (error.status === 429) return 'Muitas solicitações. Tente de novo em instantes.';
    if (error.status === 403) return 'Os recursos de IA fazem parte do plano Pro.';
  }
  return 'Não foi possível usar a IA agora. Tente de novo.';
}

/**
 * Rewrites the selection and replaces it (one undo step), then selects the
 * new text. Nothing is applied if the document changed while waiting.
 */
export async function runAiRewrite(editor: Editor, action: TextRewriteAction): Promise<AiRewriteOutcome> {
  const { state } = editor;
  const { from, to, $from, $to } = state.selection;
  const docBefore = state.doc;
  const slice = state.doc.slice(from, to);
  const inlineSelection = $from.sameParent($to) && $from.parent.isTextblock;

  // A selection inside one block slices to bare inline nodes (text runs);
  // wrap them in a paragraph so they go out as one block, not one per run.
  const sliceJson = (slice.content.toJSON() as unknown[] | null) ?? [];
  const content = slice.content.firstChild?.isInline
    ? [{ type: 'paragraph', content: sliceJson }]
    : sliceJson;

  let markdown: string;
  try {
    ({ markdown } = await aiApi.rewrite(action, { type: 'doc', content }));
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }

  if (editor.isDestroyed) return { ok: false, message: 'O editor foi fechado.' };
  if (!editor.state.doc.eq(docBefore)) {
    return { ok: false, message: 'O texto mudou enquanto a IA trabalhava. Tente de novo.' };
  }

  const blocks = markdownToTiptapDoc(markdown).content as JSONContent[];
  if (blocks.length === 0) return { ok: false, message: 'A IA não devolveu texto. Tente de novo.' };

  // Inside one paragraph / heading: splice the text in, keeping that block.
  const replacement: JSONContent[] =
    inlineSelection && blocks.length === 1 && blocks[0].content ? blocks[0].content : blocks;

  // Whole task items are rebuilt from Markdown, which has no `taskId`: the
  // rewritten items take the links (and checked state) of the selected ones by
  // position, through placeholders resolved in the same transaction. What is
  // left of a linked item outside the new ones loses the link (no duplicates).
  const links = new Map<string, { taskId: string; checked: boolean }>();
  const linkedIds = new Set<string>();
  if (!inlineSelection) {
    const selected = taskItemsBetween(docBefore, from, to);
    if (selected.some((node) => node.attrs.taskId)) {
      const rewritten = jsonTaskItems(blocks);
      if (rewritten.length !== selected.length) {
        return { ok: false, message: 'Selecione os itens que já são tarefas um de cada vez.' };
      }
      selected.forEach((node, i) => {
        const taskId: unknown = node.attrs.taskId;
        if (typeof taskId !== 'string' || !taskId) return;
        const placeholder = `${LINK_PLACEHOLDER}${i}`;
        links.set(placeholder, { taskId, checked: node.attrs.checked === true });
        linkedIds.add(taskId);
        rewritten[i].attrs = { ...rewritten[i].attrs, taskId: placeholder };
      });
    }
  }

  const sizeBefore = editor.state.doc.content.size;
  editor
    .chain()
    .focus()
    .insertContentAt({ from, to }, replacement)
    .command(({ tr }) => {
      if (links.size === 0) return true;
      const updates: Array<{ pos: number; attrs: Record<string, unknown> }> = [];
      tr.doc.descendants((node, pos) => {
        if (node.type.name !== 'taskItem') return true;
        const id: unknown = node.attrs.taskId;
        const link = typeof id === 'string' ? links.get(id) : undefined;
        if (link) {
          updates.push({ pos, attrs: { ...node.attrs, taskId: link.taskId, checked: link.checked } });
        } else if (typeof id === 'string' && linkedIds.has(id)) {
          updates.push({ pos, attrs: { ...node.attrs, taskId: null } });
        }
        return false;
      });
      updates.forEach(({ pos, attrs }) => tr.setNodeMarkup(pos, undefined, attrs));
      return true;
    })
    .run();
  const newTo = Math.min(to + (editor.state.doc.content.size - sizeBefore), editor.state.doc.content.size);
  if (newTo > from) editor.commands.setTextSelection({ from, to: newTo });
  return { ok: true };
}
