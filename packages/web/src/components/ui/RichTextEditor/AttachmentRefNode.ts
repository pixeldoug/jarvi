import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { AttachmentRefView } from './AttachmentRefView';

export interface AttachmentRefOptions {
  /** Opens the referenced attachment (by id) in the viewer when the chip is clicked. */
  onOpen?: (attachmentId: string) => void;
}

/**
 * Inline node that references a task attachment from within the description
 * text (e.g. "Criar um reel para divulgar a música mostrada em [chip]").
 *
 * It only stores the attachment id + a display label; the actual file lives in
 * the document's `_attachments` array. Rendered via a React NodeView reusing the
 * design-system `Chip` component, so it stays consistent with the rest of the UI.
 */
export const AttachmentRefNode = Node.create<AttachmentRefOptions>({
  name: 'attachmentRef',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { onOpen: undefined };
  },

  addAttributes() {
    return {
      attachmentId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-attachment-ref'),
        renderHTML: (attributes) =>
          attributes.attachmentId
            ? { 'data-attachment-ref': attributes.attachmentId as string }
            : {},
      },
      label: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-label') || '',
        renderHTML: (attributes) => ({ 'data-label': (attributes.label as string) || '' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-attachment-ref]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const label = (node.attrs.label as string) || 'anexo';
    return [
      'span',
      mergeAttributes(HTMLAttributes, { class: 'attachment-ref-chip' }),
      label,
    ];
  },

  renderText({ node }) {
    const label = (node.attrs.label as string) || 'anexo';
    return `[${label}]`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(AttachmentRefView);
  },
});
