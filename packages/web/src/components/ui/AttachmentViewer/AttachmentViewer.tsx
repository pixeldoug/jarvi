import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  DownloadSimple,
  File,
  FileAudio,
  FileCode,
  FilePdf,
  FileText,
  FileVideo,
  FileZip,
  Trash,
  X,
} from '@phosphor-icons/react';
import styles from './AttachmentViewer.module.css';

/** Minimal shape a viewer needs to render any attachment full-screen. */
export interface ViewerAttachment {
  id?: string;
  /** Display name (may already include the extension). */
  name: string;
  /** Optional separate extension (e.g. ".png"), appended to the name. */
  ext?: string;
  mimeType: string;
  /** Data URL or remote URL pointing at the file content. */
  previewUrl: string;
  /** Optional secondary line under the title (e.g. formatted date). */
  subtitle?: string;
}

function fullName(attachment: ViewerAttachment): string {
  return `${attachment.name}${attachment.ext ?? ''}`;
}

export function AttachmentFileIcon({ mimeType }: { mimeType: string }) {
  const size = 24;
  const weight = 'regular' as const;
  if (mimeType === 'application/pdf') return <FilePdf size={size} weight={weight} />;
  if (mimeType.startsWith('audio/')) return <FileAudio size={size} weight={weight} />;
  if (mimeType.startsWith('video/')) return <FileVideo size={size} weight={weight} />;
  if (mimeType === 'text/plain' || mimeType === 'text/markdown') return <FileText size={size} weight={weight} />;
  if (
    mimeType === 'text/html' ||
    mimeType === 'text/css' ||
    mimeType === 'text/javascript' ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml' ||
    mimeType.includes('typescript')
  ) return <FileCode size={size} weight={weight} />;
  if (
    mimeType === 'application/zip' ||
    mimeType === 'application/x-zip-compressed' ||
    mimeType === 'application/gzip' ||
    mimeType === 'application/x-tar' ||
    mimeType === 'application/x-7z-compressed' ||
    mimeType === 'application/x-rar-compressed'
  ) return <FileZip size={size} weight={weight} />;
  return <File size={size} weight={weight} />;
}

function AttachmentViewerPreview({ attachment }: { attachment: ViewerAttachment }) {
  if (attachment.mimeType.startsWith('image/')) {
    return (
      <img
        src={attachment.previewUrl}
        alt={fullName(attachment)}
        className={styles.viewerImage}
      />
    );
  }
  if (attachment.mimeType.startsWith('video/')) {
    return (
      <video
        src={attachment.previewUrl}
        className={styles.viewerVideo}
        controls
        autoPlay={false}
      />
    );
  }
  if (attachment.mimeType === 'application/pdf') {
    return (
      <iframe
        src={attachment.previewUrl}
        className={styles.viewerIframe}
        title={fullName(attachment)}
      />
    );
  }
  return (
    <div className={styles.viewerGenericPreview}>
      <AttachmentFileIcon mimeType={attachment.mimeType} />
      <span className={styles.viewerGenericLabel}>{fullName(attachment)}</span>
      <p className={styles.viewerGenericHint}>Prévia não disponível para este tipo de arquivo</p>
    </div>
  );
}

export interface AttachmentViewerProps {
  attachment: ViewerAttachment;
  onClose: () => void;
  /** When provided, a delete action is shown that removes then closes. */
  onRemove?: () => void;
}

export function AttachmentViewer({ attachment, onClose, onRemove }: AttachmentViewerProps) {
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = attachment.previewUrl;
    a.download = fullName(attachment);
    a.click();
  };

  const handleDelete = () => {
    onRemove?.();
    onClose();
  };

  return createPortal(
    <div className={styles.viewerOverlay} role="dialog" aria-modal="true" aria-label={`Visualizar ${fullName(attachment)}`}>
      <div className={styles.viewerInner}>
        {/* Actions top-right */}
        <div className={styles.viewerActions}>
          {onRemove && (
            <button
              type="button"
              className={styles.viewerActionBtn}
              onClick={handleDelete}
              aria-label="Excluir anexo"
            >
              <Trash size={16} weight="regular" />
            </button>
          )}
          <button
            type="button"
            className={styles.viewerActionBtn}
            onClick={handleDownload}
            aria-label="Baixar arquivo"
          >
            <DownloadSimple size={16} weight="regular" />
          </button>
          <button
            type="button"
            className={`${styles.viewerActionBtn} ${styles.viewerActionBtnClose}`}
            onClick={onClose}
            aria-label="Fechar visualizador"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        {/* Header top-left */}
        <div className={styles.viewerHeader}>
          <h2 className={styles.viewerTitle}>{fullName(attachment)}</h2>
          {attachment.subtitle && <p className={styles.viewerDate}>{attachment.subtitle}</p>}
        </div>

        {/* Preview centered */}
        <div className={styles.viewerPreviewArea}>
          <AttachmentViewerPreview attachment={attachment} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
