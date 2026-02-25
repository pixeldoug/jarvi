import { Editor } from '@tiptap/react';
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  CaretDown,
  CheckSquare,
  Code,
  CodeBlock,
  DotsThree,
  ImageSquare,
  LinkSimple,
  ListBullets,
  ListNumbers,
  Paperclip,
  TextB,
  TextItalic,
  TextStrikethrough,
  TextUnderline,
} from '@phosphor-icons/react';
import { useState, useRef, useEffect, useCallback, useReducer, MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import styles from './RichTextEditor.module.css';

interface EditorToolbarProps {
  editor: Editor;
  onImageUpload: () => void;
  onFileUpload: () => void;
}

const HEADING_OPTIONS = [
  { label: 'Texto', level: 0, shortcut: '⌘⌥0', className: styles.headingNormal },
  { label: 'Título 1', level: 1, shortcut: '⌘⌥1', className: styles.headingH1 },
  { label: 'Título 2', level: 2, shortcut: '⌘⌥2', className: styles.headingH2 },
  { label: 'Título 3', level: 3, shortcut: '⌘⌥3', className: styles.headingH3 },
];

const ICON_SIZE = 16;

function getCurrentHeadingLabel(editor: Editor): string {
  for (let i = 1; i <= 3; i++) {
    if (editor.isActive('heading', { level: i })) return `Título ${i}`;
  }
  return 'Texto';
}

function normalizeUrl(value: string): string {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) ? value : `https://${value}`;
}

export function EditorToolbar({ editor, onImageUpload, onFileUpload }: EditorToolbarProps) {
  const [showHeadingMenu, setShowHeadingMenu] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkPopoverPos, setLinkPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const [headingMenuPos, setHeadingMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [moreMenuPos, setMoreMenuPos] = useState<{ top: number; right: number } | null>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const headingDropdownRef = useRef<HTMLDivElement>(null);
  const linkWrapperRef = useRef<HTMLDivElement>(null);
  const linkDialogRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuDropdownRef = useRef<HTMLDivElement>(null);

  // Re-render on every editor transaction (including selection-only changes) so
  // that isActive() and can() always reflect the current selection state.
  const [, forceUpdate] = useReducer(x => x + 1, 0);
  useEffect(() => {
    editor.on('transaction', forceUpdate);
    return () => { editor.off('transaction', forceUpdate); };
  }, [editor]);

  const canUndo = editor.can().chain().focus().undo().run();
  const canRedo = editor.can().chain().focus().redo().run();

  const toolbarButtonClassName = useCallback((isActive = false, isDisabled = false) => {
    return [
      styles.toolbarBtn,
      isActive ? styles.active : '',
      isDisabled ? styles.toolbarBtnDisabled : '',
    ].filter(Boolean).join(' ');
  }, []);

  const handleToolbarMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-allow-focus="true"]')) return;
    event.preventDefault();
  }, []);

  const closeLinkDialog = useCallback(() => {
    setShowLinkDialog(false);
    setLinkPopoverPos(null);
  }, []);

  // Close popovers on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        headingRef.current && !headingRef.current.contains(target) &&
        headingDropdownRef.current && !headingDropdownRef.current.contains(target)
      ) {
        setShowHeadingMenu(false);
      }
      if (
        linkWrapperRef.current && !linkWrapperRef.current.contains(target) &&
        linkDialogRef.current && !linkDialogRef.current.contains(target)
      ) {
        closeLinkDialog();
      }
      if (
        moreMenuRef.current && !moreMenuRef.current.contains(target) &&
        moreMenuDropdownRef.current && !moreMenuDropdownRef.current.contains(target)
      ) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [closeLinkDialog]);

  // Keyboard dismiss for toolbar popovers
  useEffect(() => {
    if (!showHeadingMenu && !showLinkDialog && !showMoreMenu) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setShowHeadingMenu(false);
      closeLinkDialog();
      setShowMoreMenu(false);
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showHeadingMenu, showLinkDialog, showMoreMenu, closeLinkDialog]);

  // Focus link input when dialog opens.
  useEffect(() => {
    if (!showLinkDialog) return;
    const timeout = window.setTimeout(() => {
      linkInputRef.current?.focus();
      linkInputRef.current?.select();
    }, 20);
    return () => window.clearTimeout(timeout);
  }, [showLinkDialog]);

  const applyHeading = useCallback((level: number) => {
    if (level === 0) {
      editor.chain().focus().setParagraph().run();
    } else {
      editor.chain().focus().toggleHeading({ level: level as 1|2|3 }).run();
    }
    setShowHeadingMenu(false);
  }, [editor]);

  const applyUndo = useCallback(() => {
    editor.chain().focus().undo().run();
  }, [editor]);

  const applyRedo = useCallback(() => {
    editor.chain().focus().redo().run();
  }, [editor]);

  const applyLink = useCallback(() => {
    const url = linkUrl.trim();
    if (!url) {
      editor.chain().focus().unsetLink().run();
    } else {
      const href = normalizeUrl(url);
      editor.chain().focus().setLink({ href }).run();
    }
    setLinkUrl('');
    closeLinkDialog();
  }, [editor, linkUrl, closeLinkDialog]);

  const removeLink = useCallback(() => {
    editor.chain().focus().unsetLink().run();
    setLinkUrl('');
    closeLinkDialog();
  }, [editor, closeLinkDialog]);

  const openLinkDialog = useCallback(() => {
    const existing = editor.getAttributes('link').href as string | undefined;
    setLinkUrl(existing ?? '');
    setShowHeadingMenu(false);
    setShowMoreMenu(false);

    const { view } = editor;
    const { from, to } = view.state.selection;
    const startCoords = view.coordsAtPos(from);
    const endCoords = view.coordsAtPos(to);
    const left = Math.min(startCoords.left, endCoords.left);
    setLinkPopoverPos({ top: startCoords.bottom + 8, left });

    setShowLinkDialog(true);
  }, [editor]);

  const executeAndCloseMoreMenu = useCallback((action: () => void) => {
    action();
    setShowMoreMenu(false);
  }, []);

  const overflowButtonClassName = (isActive = false, isDisabled = false) =>
    [
      styles.moreMenuItem,
      isActive ? styles.moreMenuItemActive : '',
      isDisabled ? styles.moreMenuItemDisabled : '',
    ]
      .filter(Boolean)
      .join(' ');

  return (
    // Prevent mousedown from stealing focus away from the editor while still
    // allowing focus inside the link input.
    <div
      className={styles.toolbar}
      onMouseDown={handleToolbarMouseDown}
      role="toolbar"
      aria-label="Barra de formatação"
    >
      {/* Heading picker */}
      <div className={styles.headingPickerWrapper} ref={headingRef}>
        <button
          type="button"
          className={`${styles.toolbarBtnWide} ${editor.isActive('heading') ? styles.active : ''}`}
          onClick={() => {
            const rect = headingRef.current?.getBoundingClientRect();
            if (rect) setHeadingMenuPos({ top: rect.bottom + 4, left: rect.left });
            setShowHeadingMenu(v => !v);
            closeLinkDialog();
            setShowMoreMenu(false);
          }}
          title="Nível de título"
          aria-label="Nível de título"
          aria-expanded={showHeadingMenu}
          aria-haspopup="menu"
        >
          <span>{getCurrentHeadingLabel(editor)}</span>
          <CaretDown size={ICON_SIZE} weight="bold" className={styles.toolbarIcon} />
        </button>
      </div>

      {showHeadingMenu && headingMenuPos && createPortal(
        <div
          className={styles.headingDropdown}
          ref={headingDropdownRef}
          style={{ top: headingMenuPos.top, left: headingMenuPos.left }}
          role="menu"
          aria-label="Níveis de título"
          data-allow-focus="true"
        >
          {HEADING_OPTIONS.map(opt => {
            const isActive = opt.level === 0
              ? editor.isActive('paragraph') && !editor.isActive('heading')
              : editor.isActive('heading', { level: opt.level });

            return (
              <button
                key={opt.level}
                type="button"
                className={`${styles.headingItem} ${isActive ? styles.headingItemActive : ''}`}
                onClick={() => applyHeading(opt.level)}
                role="menuitemradio"
                aria-checked={isActive}
                data-allow-focus="true"
              >
                <span className={opt.className}>{opt.label}</span>
                <span className={styles.headingItemShortcut}>{opt.shortcut}</span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}

      {/* Bold */}
      <button
        type="button"
        className={toolbarButtonClassName(editor.isActive('bold'))}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Negrito (⌘B)"
        aria-label="Negrito"
        aria-pressed={editor.isActive('bold')}
      >
        <TextB size={ICON_SIZE} weight="regular" className={styles.toolbarIcon} />
      </button>

      {/* Italic */}
      <button
        type="button"
        className={toolbarButtonClassName(editor.isActive('italic'))}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italico (⌘I)"
        aria-label="Italico"
        aria-pressed={editor.isActive('italic')}
      >
        <TextItalic size={ICON_SIZE} weight="regular" className={styles.toolbarIcon} />
      </button>

      {/* Link */}
      <div className={styles.linkDialogAnchor} ref={linkWrapperRef}>
        <button
          type="button"
          className={toolbarButtonClassName(editor.isActive('link'))}
          onClick={openLinkDialog}
          title="Link"
          aria-label="Link"
          aria-expanded={showLinkDialog}
          aria-haspopup="dialog"
          aria-pressed={editor.isActive('link')}
        >
          <LinkSimple size={ICON_SIZE} weight="regular" className={styles.toolbarIcon} />
        </button>
      </div>

      {showLinkDialog && linkPopoverPos && createPortal(
        <div
          className={styles.linkPopover}
          ref={linkDialogRef}
          style={{ top: linkPopoverPos.top, left: linkPopoverPos.left }}
          data-allow-focus="true"
          role="dialog"
          aria-label="Inserir link"
        >
          <p className={styles.linkPopoverLabel}>Cole o link</p>
          <input
            ref={linkInputRef}
            className={styles.linkInput}
            type="url"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            placeholder="https://..."
            aria-label="URL do link"
            data-allow-focus="true"
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyLink();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                closeLinkDialog();
              }
            }}
          />
          <div className={styles.linkActions} data-allow-focus="true">
            {editor.isActive('link') && (
              <button type="button" className={styles.linkSecondaryBtn} onClick={removeLink} data-allow-focus="true">
                Remover
              </button>
            )}
            <button type="button" className={styles.linkConfirmBtn} onClick={applyLink} data-allow-focus="true">
              Aplicar
            </button>
          </div>
        </div>,
        document.body,
      )}

      <div className={styles.toolbarDivider} />

      {/* Ordered list */}
      <button
        type="button"
        className={toolbarButtonClassName(editor.isActive('orderedList'))}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Lista numerada"
        aria-label="Lista numerada"
        aria-pressed={editor.isActive('orderedList')}
      >
        <ListNumbers size={ICON_SIZE} weight="regular" className={styles.toolbarIcon} />
      </button>

      {/* Bullet list */}
      <button
        type="button"
        className={toolbarButtonClassName(editor.isActive('bulletList'))}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Lista com marcadores"
        aria-label="Lista com marcadores"
        aria-pressed={editor.isActive('bulletList')}
      >
        <ListBullets size={ICON_SIZE} weight="regular" className={styles.toolbarIcon} />
      </button>

      <div className={styles.toolbarDivider} />

      <button
        type="button"
        className={styles.toolbarBtn}
        onClick={onFileUpload}
        title="Anexar arquivo"
        aria-label="Anexar arquivo"
      >
        <Paperclip size={ICON_SIZE} weight="regular" className={styles.toolbarIcon} />
      </button>

      {/* Task list */}
      <button
        type="button"
        className={toolbarButtonClassName(editor.isActive('taskList'))}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        title="Itens de ação"
        aria-label="Itens de ação"
        aria-pressed={editor.isActive('taskList')}
      >
        <CheckSquare size={ICON_SIZE} weight="regular" className={styles.toolbarIcon} />
      </button>

      <div className={styles.moreMenuAnchor} ref={moreMenuRef}>
        <button
          type="button"
          className={toolbarButtonClassName(showMoreMenu)}
          onClick={() => {
            const rect = moreMenuRef.current?.getBoundingClientRect();
            if (rect) setMoreMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
            setShowMoreMenu(v => !v);
            setShowHeadingMenu(false);
            closeLinkDialog();
          }}
          title="Mais opções"
          aria-label="Mais opções"
          aria-haspopup="menu"
          aria-expanded={showMoreMenu}
        >
          <DotsThree size={ICON_SIZE} weight="bold" className={styles.toolbarIcon} />
        </button>
      </div>

      {showMoreMenu && moreMenuPos && createPortal(
        <div
          className={styles.moreMenu}
          ref={moreMenuDropdownRef}
          style={{ top: moreMenuPos.top, right: moreMenuPos.right }}
          role="menu"
          aria-label="Mais opções de formatação"
          data-allow-focus="true"
        >
          <button
            type="button"
            className={overflowButtonClassName(false, !canUndo)}
            onClick={() => executeAndCloseMoreMenu(applyUndo)}
            disabled={!canUndo}
            role="menuitem"
            data-allow-focus="true"
          >
            <ArrowCounterClockwise size={ICON_SIZE} weight="regular" />
            <span>Desfazer</span>
          </button>
          <button
            type="button"
            className={overflowButtonClassName(false, !canRedo)}
            onClick={() => executeAndCloseMoreMenu(applyRedo)}
            disabled={!canRedo}
            role="menuitem"
            data-allow-focus="true"
          >
            <ArrowClockwise size={ICON_SIZE} weight="regular" />
            <span>Refazer</span>
          </button>
          <button
            type="button"
            className={overflowButtonClassName(editor.isActive('underline'))}
            onClick={() => executeAndCloseMoreMenu(() => editor.chain().focus().toggleUnderline().run())}
            role="menuitemcheckbox"
            aria-checked={editor.isActive('underline')}
            data-allow-focus="true"
          >
            <TextUnderline size={ICON_SIZE} weight="regular" />
            <span>Sublinhado</span>
          </button>
          <button
            type="button"
            className={overflowButtonClassName(editor.isActive('strike'))}
            onClick={() => executeAndCloseMoreMenu(() => editor.chain().focus().toggleStrike().run())}
            role="menuitemcheckbox"
            aria-checked={editor.isActive('strike')}
            data-allow-focus="true"
          >
            <TextStrikethrough size={ICON_SIZE} weight="regular" />
            <span>Tachado</span>
          </button>
          <button
            type="button"
            className={overflowButtonClassName(editor.isActive('code'))}
            onClick={() => executeAndCloseMoreMenu(() => editor.chain().focus().toggleCode().run())}
            role="menuitemcheckbox"
            aria-checked={editor.isActive('code')}
            data-allow-focus="true"
          >
            <Code size={ICON_SIZE} weight="regular" />
            <span>Código inline</span>
          </button>
          <button
            type="button"
            className={overflowButtonClassName(editor.isActive('codeBlock'))}
            onClick={() => executeAndCloseMoreMenu(() => editor.chain().focus().toggleCodeBlock().run())}
            role="menuitemcheckbox"
            aria-checked={editor.isActive('codeBlock')}
            data-allow-focus="true"
          >
            <CodeBlock size={ICON_SIZE} weight="regular" />
            <span>Bloco de código</span>
          </button>
          <button
            type="button"
            className={overflowButtonClassName()}
            onClick={() => executeAndCloseMoreMenu(onImageUpload)}
            role="menuitem"
            data-allow-focus="true"
          >
            <ImageSquare size={ICON_SIZE} weight="regular" />
            <span>Inserir imagem</span>
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
