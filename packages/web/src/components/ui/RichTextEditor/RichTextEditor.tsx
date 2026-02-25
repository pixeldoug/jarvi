import { useEditor, EditorContent } from '@tiptap/react';
import { mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import { DotsThree, UploadSimple } from '@phosphor-icons/react';
import { useEffect, useRef, useCallback, useState, DragEvent, ClipboardEvent, MouseEvent } from 'react';
import styles from './RichTextEditor.module.css';
import { Button } from '../Button/Button';
import { EditorToolbar } from './EditorToolbar';
import { SlashCommandExtension } from './SlashCommandMenu';

const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const FEEDBACK_TIMEOUT_MS = 4000;
const MIN_EDITOR_HEIGHT = 180;
const MAX_EDITOR_HEIGHT = 640;
const EDITOR_HEIGHT_STORAGE_KEY = 'jarvi.richTextEditor.height';

type FeedbackTone = 'info' | 'success' | 'error';

interface FeedbackState {
  tone: FeedbackTone;
  message: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
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

function parseContent(raw: string): object | string {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.type === 'doc') {
      return parsed;
    }
    return raw;
  } catch {
    return raw;
  }
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
  const [isResizing, setIsResizing] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const dragCounterRef = useRef(0);

  const publishFeedback = useCallback((message: string, tone: FeedbackTone = 'info') => {
    setFeedback({ tone, message });
  }, []);

  const clampEditorHeight = useCallback((height: number): number => {
    return Math.min(MAX_EDITOR_HEIGHT, Math.max(MIN_EDITOR_HEIGHT, Math.round(height)));
  }, []);

  const setContainerHeight = useCallback((height: number) => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const container = wrapper.parentElement;
    if (!container) return;

    const clamped = clampEditorHeight(height);
    container.style.flex = '0 0 auto';
    container.style.height = `${clamped}px`;
    container.style.minHeight = `${MIN_EDITOR_HEIGHT}px`;
  }, [clampEditorHeight]);

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => {
      setFeedback(null);
    }, FEEDBACK_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  useEffect(() => {
    const storedHeight = window.localStorage.getItem(EDITOR_HEIGHT_STORAGE_KEY);
    if (!storedHeight) return;
    const parsed = Number(storedHeight);
    if (!Number.isFinite(parsed)) return;
    setContainerHeight(parsed);
  }, [setContainerHeight]);

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
    ],
    content: parseContent(content) || '',
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      const json = JSON.stringify(editor.getJSON());
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

    const parsed = parseContent(content);
    if (parsed) {
      editor.commands.setContent(parsed as object, { emitUpdate: false });
    } else {
      editor.commands.clearContent();
    }
  }, [content, editor]);

  // Update editable state
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [readOnly, editor]);

  const insertFile = useCallback((file: File) => {
    if (!editor) return;
    if (!editor.isEditable) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      publishFeedback(
        `"${file.name}" excede o limite de ${MAX_FILE_SIZE_MB} MB.`,
        'error',
      );
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      publishFeedback(`Nao foi possivel anexar "${file.name}".`, 'error');
    };

    reader.onload = (e) => {
      const src = e.target?.result as string;
      if (!src) {
        publishFeedback(`Nao foi possivel processar "${file.name}".`, 'error');
        return;
      }

      if (isImageFile(file)) {
        editor.chain().focus().setImage({ src, alt: file.name }).run();
        publishFeedback(`Imagem "${file.name}" inserida.`, 'success');
      } else {
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
    };
    reader.readAsDataURL(file);
  }, [editor, publishFeedback]);

  const handleImageUpload = useCallback(() => {
    if (readOnly) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/gif';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file || !editor) return;
      insertFile(file);
    };
    input.click();
  }, [editor, insertFile, readOnly]);

  const handleFileUpload = useCallback(() => {
    if (readOnly) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      files.forEach(insertFile);
    };
    input.click();
  }, [insertFile, readOnly]);

  const handlePaste = useCallback((e: ClipboardEvent<HTMLDivElement>) => {
    if (readOnly) return;

    const files = Array.from(e.clipboardData.files);
    if (!files.length) return;

    e.preventDefault();
    files.forEach(insertFile);
  }, [insertFile, readOnly]);

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
    if (!files.length) return;
    files.forEach(insertFile);
  }, [insertFile, readOnly]);

  const handleResizeStart = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    if (readOnly) return;
    event.preventDefault();

    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const startY = event.clientY;
    const startHeight = wrapper.getBoundingClientRect().height;
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;

    setIsResizing(true);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      setContainerHeight(startHeight + deltaY);
    };

    const onMouseUp = () => {
      const currentHeight = wrapperRef.current?.getBoundingClientRect().height;
      if (currentHeight) {
        window.localStorage.setItem(
          EDITOR_HEIGHT_STORAGE_KEY,
          String(clampEditorHeight(currentHeight)),
        );
      }

      setIsResizing(false);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [clampEditorHeight, readOnly, setContainerHeight]);

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
    isResizing ? styles.resizing : '',
    readOnly ? styles.readOnly : '',
  ].filter(Boolean).join(' ');

  return (
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
      {!readOnly && (
        <EditorToolbar
          editor={editor}
          onImageUpload={handleImageUpload}
          onFileUpload={handleFileUpload}
        />
      )}
      <div className={styles.editorArea} onPaste={handlePaste} data-has-actions={!readOnly && (onSave || onCancel)}>
        <EditorContent editor={editor} />
        {!readOnly && (
          <button
            type="button"
            className={styles.resizeHandle}
            onMouseDown={handleResizeStart}
            aria-label="Redimensionar area de texto"
            title="Arraste para redimensionar"
          >
            <DotsThree size={12} weight="bold" aria-hidden="true" />
          </button>
        )}
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
  );
}
