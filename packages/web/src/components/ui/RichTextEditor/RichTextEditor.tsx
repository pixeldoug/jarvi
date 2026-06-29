import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import {
  Trash,
  UploadSimple,
} from '@phosphor-icons/react';
import { useEffect, useRef, useCallback, useState, DragEvent, ClipboardEvent, KeyboardEvent } from 'react';
import styles from './RichTextEditor.module.css';
import { Button } from '../Button/Button';
import { EditorToolbar } from './EditorToolbar';
import { SlashCommandExtension } from './SlashCommandMenu';
import { AttachmentRefNode } from './AttachmentRefNode';
import { AttachmentViewer, AttachmentFileIcon } from '../AttachmentViewer';

const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const FEEDBACK_TIMEOUT_MS = 4000;

type FeedbackTone = 'info' | 'success' | 'error';

interface FeedbackState {
  tone: FeedbackTone;
  message: string;
}

interface AttachmentFile {
  id: string;
  name: string;
  ext: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
  previewUrl: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

function formatAttachmentDate(date: Date): string {
  const day = date.getDate();
  const month = date.toLocaleDateString('pt-BR', { month: 'short' })
    .replace('.', '')
    .replace(/^./, s => s.toUpperCase());
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}:${mins}`;
}

function AttachmentPreviewContent({ attachment }: { attachment: AttachmentFile }) {
  if (attachment.mimeType.startsWith('image/')) {
    return (
      <img
        src={attachment.previewUrl}
        alt={`${attachment.name}${attachment.ext}`}
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
      {attachment.ext && <span className={styles.previewExtBadge}>{attachment.ext.replace('.', '').toUpperCase()}</span>}
    </div>
  );
}

function AttachmentCard({
  attachment,
  onRemove,
  onOpen,
}: {
  attachment: AttachmentFile;
  onRemove: (id: string) => void;
  onOpen: (attachment: AttachmentFile) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  const handleCardClick = (e: React.MouseEvent) => {
    // Prevent opening viewer when clicking the delete button
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
      aria-label={`Visualizar ${attachment.name}${attachment.ext}`}
    >
      <div className={styles.attachmentPreview}>
        <AttachmentPreviewContent attachment={attachment} />
        {isHovered && (
          <button
            type="button"
            className={styles.attachmentDeleteBtn}
            onClick={() => onRemove(attachment.id)}
            aria-label={`Remover anexo ${attachment.name}${attachment.ext}`}
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

export interface RichTextEditorProps {
  content: string;
  onChange: (json: string) => void;
  onBlur?: () => void;
  onSave?: () => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
  placeholder?: string;
  readOnly?: boolean;
}

interface SerializedAttachment {
  id: string;
  name: string;
  ext: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  previewData: string; // base64 data URL
}

function parseContentAndAttachments(raw: string): {
  content: object | string;
  attachments: AttachmentFile[];
} {
  if (!raw) return { content: '', attachments: [] };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.type === 'doc') {
      const serialized: SerializedAttachment[] = parsed._attachments ?? [];
      const attachments: AttachmentFile[] = serialized.map(a => ({
        id: a.id,
        name: a.name,
        ext: a.ext,
        mimeType: a.mimeType,
        size: a.size,
        uploadedAt: new Date(a.uploadedAt),
        previewUrl: a.previewData,
      }));
      const { _attachments: _removed, ...doc } = parsed;
      return { content: doc, attachments };
    }
    return { content: raw, attachments: [] };
  } catch {
    return { content: raw, attachments: [] };
  }
}

function serializeWithAttachments(
  editorJson: object,
  attachments: AttachmentFile[],
): string {
  const combined: Record<string, unknown> = { ...editorJson };
  if (attachments.length > 0) {
    combined._attachments = attachments.map(a => ({
      id: a.id,
      name: a.name,
      ext: a.ext,
      mimeType: a.mimeType,
      size: a.size,
      uploadedAt: a.uploadedAt.toISOString(),
      previewData: a.previewUrl,
    } satisfies SerializedAttachment));
  }
  return JSON.stringify(combined);
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error(`Cannot read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

// Image compression on upload. Without this, attachments store the ORIGINAL
// image inline as base64 (data URL) inside the task description, bloating the
// database, every API payload, and the LLM context. Resizing + re-encoding
// keeps quality good for screen/preview/vision while cutting size massively.
const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_COMPRESSION_QUALITY = 0.9;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    // NOTE: `document.createElement('img')` (not `new Image()`) because this
    // file imports TipTap's `Image` node, which shadows the DOM constructor.
    const img = document.createElement('img');
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Cannot decode image'));
    img.src = src;
  });
}

/**
 * Resize/re-encode an image file into a (smaller) data URL. Falls back to the
 * raw data URL on any failure, and never re-encodes animated GIFs (canvas would
 * flatten them to a single frame).
 */
async function imageFileToDataUrl(file: File): Promise<string> {
  const rawDataUrl = await readFileAsBase64(file);

  if (!file.type.startsWith('image/') || file.type === 'image/gif') {
    return rawDataUrl;
  }

  try {
    const img = await loadImage(rawDataUrl);
    const largestSide = Math.max(img.width, img.height);
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / largestSide);
    const targetW = Math.max(1, Math.round(img.width * scale));
    const targetH = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return rawDataUrl;
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // Prefer WebP (best ratio for screenshots); browsers without WebP export
    // return a PNG data URL, which we still accept (resize alone already helps).
    let encoded = canvas.toDataURL('image/webp', IMAGE_COMPRESSION_QUALITY);
    if (!encoded.startsWith('data:image/webp')) {
      encoded = canvas.toDataURL('image/png');
    }

    // Keep whichever is smaller — never grow the payload.
    return encoded.length < rawDataUrl.length ? encoded : rawDataUrl;
  } catch {
    return rawDataUrl;
  }
}

/** Derive the MIME type and approximate byte size from a base64 data URL. */
function dataUrlInfo(dataUrl: string): { mimeType: string; size: number } {
  const match = /^data:([^;,]+)[;,]/.exec(dataUrl);
  const mimeType = match?.[1] ?? 'application/octet-stream';
  const commaIdx = dataUrl.indexOf(',');
  const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : '';
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const size = Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
  return { mimeType, size };
}

// Override TaskItem to use inline styles so the flex row layout can never be
// broken by external CSS or CSS Module scoping issues.
// Also adds a `subtaskId` attribute so the parent can track which editor task
// item corresponds to which persisted sub-task.
const InlineTaskItem = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      subtaskId: {
        default: null,
        parseHTML: element => element.getAttribute('data-subtask-id') || null,
        renderHTML: attributes => {
          if (!attributes.subtaskId) return {};
          return { 'data-subtask-id': attributes.subtaskId };
        },
      },
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'li',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'taskItem',
        'data-checked': node.attrs.checked,
        ...(node.attrs.subtaskId ? { 'data-subtask-id': node.attrs.subtaskId } : {}),
        style: [
          'display:flex',
          'flex-direction:row',
          'align-items:flex-start',
          'gap:8px',
          'margin:2px 0',
          'padding:0',
          'list-style:none',
        ].join(';'),
      }),
      [
        'label',
        {
          contenteditable: 'false',
          style: 'flex-shrink:0;display:flex;padding-top:2px;cursor:pointer;',
        },
        [
          'input',
          {
            type: 'checkbox',
            style: 'width:14px;height:14px;margin:0;accent-color:var(--semantic-control-border-active);cursor:pointer;',
            ...(node.attrs.checked ? { checked: 'checked' } : {}),
          },
        ],
      ],
      ['div', { style: 'flex:1;min-width:0;' }, 0],
    ];
  },
}).configure({ nested: false });

export function RichTextEditor({
  content,
  onChange,
  onBlur,
  onSave,
  onCancel,
  placeholder = 'Adicionar descrição...',
  readOnly = false,
}: RichTextEditorProps) {
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  onChangeRef.current = onChange;
  onBlurRef.current = onBlur;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const initialParsed = useRef(parseContentAndAttachments(content));
  const [attachments, setAttachments] = useState<AttachmentFile[]>(
    () => initialParsed.current.attachments,
  );
  const [viewedAttachment, setViewedAttachment] = useState<AttachmentFile | null>(null);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const dragCounterRef = useRef(0);

  // Opens the attachment referenced by an inline chip (attachmentRef NodeView).
  const handleOpenAttachmentRef = useCallback((attachmentId: string) => {
    const match = attachmentsRef.current.find((a) => a.id === attachmentId);
    if (match) setViewedAttachment(match);
  }, []);

  const publishFeedback = useCallback((message: string, tone: FeedbackTone = 'info') => {
    setFeedback({ tone, message });
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => {
      setFeedback(null);
    }, FEEDBACK_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: {
          HTMLAttributes: { class: 'code-block' },
        },
      }),
      Underline,
      TaskList,
      InlineTaskItem,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Image.configure({ HTMLAttributes: { class: 'editor-image' } }),
      Placeholder.configure({ placeholder }),
      Typography,
      SlashCommandExtension,
      AttachmentRefNode.configure({ onOpen: handleOpenAttachmentRef }),
    ],
    content: initialParsed.current.content || '',
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      const json = serializeWithAttachments(editor.getJSON(), attachmentsRef.current);
      // Keep lastContentRef in sync so the external-content sync effect
      // does not call setContent() (and reset the cursor) for changes that
      // originated from the editor itself.
      lastContentRef.current = json;
      onChangeRef.current(json);
    },
    onBlur: ({ event }) => {
      const nextFocused = event.relatedTarget as Node | null;
      const movedWithinEditor = !!nextFocused && !!wrapperRef.current?.contains(nextFocused);

      // Only trigger parent blur when focus actually leaves the editor shell.
      if (!movedWithinEditor) {
        onBlurRef.current?.();
      }
    },
    editorProps: {
      attributes: {
        class: 'prosemirror-editor',
        'aria-label': 'Descrição da tarefa',
        'aria-multiline': 'true',
        'aria-readonly': readOnly ? 'true' : 'false',
        spellcheck: 'true',
      },
    },
  });

  // Sync external content changes (e.g. task switch)
  const lastContentRef = useRef(content);
  useEffect(() => {
    if (!editor) return;
    if (content === lastContentRef.current) return;
    lastContentRef.current = content;

    const { content: parsed, attachments: parsedAttachments } = parseContentAndAttachments(content);
    if (parsed) {
      editor.commands.setContent(parsed as object, { emitUpdate: false });
    } else {
      editor.commands.clearContent(false);
    }
    setAttachments(parsedAttachments);
  }, [content, editor]);

  // Update editable state — pass false so setEditable does not emit onUpdate,
  // which would call onChange with the current (possibly empty) doc and
  // kick off a spurious debounced save that overwrites real task content.
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly, false);
  }, [readOnly, editor]);

  const insertFile = useCallback(async (file: File) => {
    if (!editor) return;
    if (!editor.isEditable) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      publishFeedback(
        `"${file.name}" excede o limite de ${MAX_FILE_SIZE_MB} MB.`,
        'error',
      );
      return;
    }

    try {
      if (isImageFile(file)) {
        // Compress/resize before embedding so the inline image data URL stays
        // small (avoids bloating the saved document + downstream payloads).
        const src = await imageFileToDataUrl(file);
        editor.chain().focus().setImage({ src, alt: file.name }).run();
        publishFeedback(`Imagem "${file.name}" inserida.`, 'success');
      } else {
        const src = await readFileAsBase64(file);
        // Insert non-image files as a downloadable link with file info
        const sizeLabel = formatFileSize(file.size);
        editor
          .chain()
          .focus()
          .insertContent({
            type: 'paragraph',
            content: [
              {
                type: 'text',
                marks: [{ type: 'link', attrs: { href: src, title: `${file.name} (${sizeLabel})` } }],
                text: `Anexo: ${file.name} (${sizeLabel})`,
              },
            ],
          })
          .run();
        publishFeedback(`Arquivo "${file.name}" anexado.`, 'success');
      }
    } catch {
      publishFeedback(`Nao foi possivel anexar "${file.name}".`, 'error');
    }
  }, [editor, publishFeedback]);

  const handleImageUpload = useCallback(() => {
    if (readOnly) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/gif';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file || !editor) return;
      void insertFile(file);
    };
    input.click();
  }, [editor, insertFile, readOnly]);

  const addFilesAsAttachments = useCallback(async (files: File[]) => {
    if (!files.length) return;
    const newAttachments: AttachmentFile[] = await Promise.all(
      files.map(async file => {
        const dotIdx = file.name.lastIndexOf('.');
        const name = dotIdx > 0 ? file.name.slice(0, dotIdx) : file.name;
        const ext = dotIdx > 0 ? file.name.slice(dotIdx) : '';
        const isImage = file.type.startsWith('image/');
        const previewUrl = isImage
          ? await imageFileToDataUrl(file)
          : await readFileAsBase64(file);
        const { mimeType, size } = isImage
          ? dataUrlInfo(previewUrl)
          : { mimeType: file.type, size: file.size };
        return {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name,
          ext,
          mimeType,
          size,
          uploadedAt: new Date(),
          previewUrl,
        };
      }),
    );
    setAttachments(prev => {
      const next = [...prev, ...newAttachments];
      if (editor) {
        const json = serializeWithAttachments(editor.getJSON(), next);
        lastContentRef.current = json;
        onChangeRef.current(json);
      }
      return next;
    });
  }, [editor]);

  const handleFileUpload = useCallback(() => {
    if (readOnly) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = () => {
      void addFilesAsAttachments(Array.from(input.files ?? []));
    };
    input.click();
  }, [addFilesAsAttachments, readOnly]);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments(prev => {
      const next = prev.filter(a => a.id !== id);
      if (editor) {
        const json = serializeWithAttachments(editor.getJSON(), next);
        lastContentRef.current = json;
        onChangeRef.current(json);
      }
      return next;
    });
  }, [editor]);

  const handlePaste = useCallback((e: ClipboardEvent<HTMLDivElement>) => {
    if (readOnly) return;

    const files = Array.from(e.clipboardData.files);
    if (!files.length) return;

    e.preventDefault();
    void addFilesAsAttachments(files);
  }, [addFilesAsAttachments, readOnly]);

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (readOnly) return;

    dragCounterRef.current += 1;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, [readOnly]);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (readOnly) return;

    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, [readOnly]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (readOnly) return;

    e.dataTransfer.dropEffect = 'copy';
  }, [readOnly]);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (readOnly) return;

    dragCounterRef.current = 0;
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    void addFilesAsAttachments(files);
  }, [addFilesAsAttachments, readOnly]);

  const handleSaveClick = useCallback(() => {
    if (!onSave) return;
    void Promise.resolve(onSave());
  }, [onSave]);

  const handleCancelClick = useCallback(() => {
    if (!onCancel) return;
    void Promise.resolve(onCancel());
  }, [onCancel]);

  if (!editor) return null;

  const wrapperClassName = [
    styles.wrapper,
    readOnly ? styles.readOnly : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={styles.editorContainer}>
      {!readOnly && (
        <BubbleMenu
          editor={editor}
          shouldShow={({ state }) => !state.selection.empty}
        >
          <EditorToolbar
            editor={editor}
            onImageUpload={handleImageUpload}
            onFileUpload={handleFileUpload}
          />
        </BubbleMenu>
      )}
      <div
        ref={wrapperRef}
        className={wrapperClassName}
        role="group"
        aria-label="Editor de descricao"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className={styles.editorArea} onPaste={handlePaste} data-has-actions={!readOnly && (onSave || onCancel)}>
          <EditorContent editor={editor} />
        </div>
        {!readOnly && (onSave || onCancel) && (
          <div className={styles.editorActions}>
            <Button
              variant="secondary"
              size="small"
              onClick={handleCancelClick}
              disabled={!onCancel}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="small"
              onClick={handleSaveClick}
              disabled={!onSave}
            >
              Salvar
            </Button>
          </div>
        )}
        {feedback && (
          <p
            className={`${styles.feedback} ${
              feedback.tone === 'error'
                ? styles.feedbackError
                : feedback.tone === 'success'
                  ? styles.feedbackSuccess
                  : styles.feedbackInfo
            }`}
            role={feedback.tone === 'error' ? 'alert' : 'status'}
            aria-live={feedback.tone === 'error' ? 'assertive' : 'polite'}
          >
            {feedback.message}
          </p>
        )}
        {isDragging && (
          <div className={styles.dropOverlay}>
            <div className={styles.dropOverlayContent}>
              <UploadSimple size={40} weight="regular" />
              <span>Solte para anexar</span>
            </div>
          </div>
        )}
      </div>

      {attachments.length > 0 && (
        <div className={styles.attachmentsList} role="list" aria-label="Arquivos anexados">
          {attachments.map(att => (
            <AttachmentCard
              key={att.id}
              attachment={att}
              onRemove={handleRemoveAttachment}
              onOpen={setViewedAttachment}
            />
          ))}
        </div>
      )}

      {viewedAttachment && (
        <AttachmentViewer
          attachment={{
            id: viewedAttachment.id,
            name: viewedAttachment.name,
            ext: viewedAttachment.ext,
            mimeType: viewedAttachment.mimeType,
            previewUrl: viewedAttachment.previewUrl,
            subtitle: formatAttachmentDate(viewedAttachment.uploadedAt),
          }}
          onClose={() => setViewedAttachment(null)}
          onRemove={() => handleRemoveAttachment(viewedAttachment.id)}
        />
      )}
    </div>
  );
}
