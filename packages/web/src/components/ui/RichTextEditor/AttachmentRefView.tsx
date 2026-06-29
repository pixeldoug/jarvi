import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Paperclip } from '@phosphor-icons/react';
import { Chip } from '../Chip';
import type { AttachmentRefOptions } from './AttachmentRefNode';

/**
 * React NodeView for the inline `attachmentRef` node. Renders the design-system
 * `Chip` so the inline attachment reference matches the rest of the UI, and
 * opens the attachment viewer on click via the node's `onOpen` option.
 */
export function AttachmentRefView({ node, extension }: NodeViewProps) {
  const label = (node.attrs.label as string) || 'anexo';
  const attachmentId = node.attrs.attachmentId as string | null;
  const { onOpen } = extension.options as AttachmentRefOptions;

  return (
    <NodeViewWrapper
      as="span"
      style={{ display: 'inline-flex', verticalAlign: 'middle', margin: '0 1px' }}
    >
      <Chip
        label={label}
        size="small"
        chipStyle="filled"
        interactive
        icon={<Paperclip size={14} weight="regular" />}
        onClick={() => {
          if (attachmentId && onOpen) onOpen(attachmentId);
        }}
      />
    </NodeViewWrapper>
  );
}
