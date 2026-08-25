import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CaretDown, Paperclip, Trash } from '@phosphor-icons/react';
import { Chip } from '../Chip';
import { AttachmentFileIcon } from '../AttachmentViewer';
import styles from './RichTextEditor.module.css';

export interface TaskAttachment {
  id: string;
  name: string;
  ext: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
  previewUrl: string;
}

export function formatAttachmentDate(date: Date): string {
  const day = date.getDate();
  const month = date.toLocaleDateString('pt-BR', { month: 'short' })
    .replace('.', '')
    .replace(/^./, s => s.toUpperCase());
  const year = String(date.getFullYear()).slice(-2);
  return `${day} ${month}, ${year}`;
}

function attachmentLabel(attachment: TaskAttachment): string {
  return `${attachment.name}${attachment.ext}`;
}

function AttachmentPreviewContent({ attachment }: { attachment: TaskAttachment }) {
  if (attachment.mimeType.startsWith('image/')) {
    return (
      <img
        src={attachment.previewUrl}
        alt={attachmentLabel(attachment)}
        className={styles.previewImage}
      />
    );
  }
  if (attachment.mimeType.startsWith('video/')) {
    return (
      <video
        src={attachment.previewUrl}
        className={styles.previewVideo}
        muted
        preload="metadata"
      />
    );
  }
  return (
    <div className={styles.previewIcon}>
      <AttachmentFileIcon mimeType={attachment.mimeType} />
      {attachment.ext && (
        <span className={styles.previewExtBadge}>{attachment.ext.replace('.', '').toUpperCase()}</span>
      )}
    </div>
  );
}

function AttachmentCard({
  attachment,
  onRemove,
  onOpen,
}: {
  attachment: TaskAttachment;
  onRemove?: (id: string) => void;
  onOpen: (attachment: TaskAttachment) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    onOpen(attachment);
  };

  const handleCardKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(attachment);
    }
  };

  return (
    <div
      className={`${styles.attachmentCard} ${isHovered ? styles.attachmentCardHover : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Visualizar ${attachmentLabel(attachment)}`}
    >
      <div className={styles.attachmentPreview}>
        <AttachmentPreviewContent attachment={attachment} />
        {isHovered && onRemove && (
          <button
            type="button"
            className={styles.attachmentDeleteBtn}
            onClick={() => onRemove(attachment.id)}
            aria-label={`Remover anexo ${attachmentLabel(attachment)}`}
          >
            <Trash size={16} weight="regular" />
          </button>
        )}
      </div>
      <div className={styles.attachmentContent}>
        <div className={styles.attachmentTitle}>
          <span className={styles.attachmentName}>{attachment.name}</span>
          <span className={styles.attachmentExt}>{attachment.ext}</span>
        </div>
        <span className={styles.attachmentDate}>{formatAttachmentDate(attachment.uploadedAt)}</span>
      </div>
    </div>
  );
}

export function AttachmentSection({
  attachments,
  onRemove,
  onOpen,
  readOnly = false,
  endSlot,
}: {
  attachments: TaskAttachment[];
  onRemove: (id: string) => void;
  onOpen: (attachment: TaskAttachment) => void;
  readOnly?: boolean;
  endSlot?: ReactNode;
}) {
  const stripId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const remove = readOnly ? undefined : onRemove;
  const countLabel = attachments.length === 1
    ? '1 anexo'
    : `${attachments.length} anexos`;

  return (
    <div className={styles.attachmentSection}>
      <div className={styles.attachmentMetaRow}>
        <Chip
          label={countLabel}
          icon={<Paperclip size={16} weight="regular" />}
          size="medium"
          chipStyle="filled"
          interactive
          active={isOpen}
          aria-expanded={isOpen}
          aria-controls={stripId}
          onClick={() => setIsOpen(open => !open)}
          trailing={
            <CaretDown
              size={16}
              weight="bold"
              className={`${styles.triggerCaret} ${isOpen ? styles.triggerCaretOpen : ''}`}
            />
          }
        />
        {endSlot && <div className={styles.attachmentMetaEnd}>{endSlot}</div>}
      </div>

      {isOpen && (
        <div
          id={stripId}
          className={styles.attachmentsStrip}
          role="list"
          aria-label="Arquivos anexados"
        >
          {attachments.map(att => (
            <AttachmentCard
              key={att.id}
              attachment={att}
              onRemove={remove}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}
