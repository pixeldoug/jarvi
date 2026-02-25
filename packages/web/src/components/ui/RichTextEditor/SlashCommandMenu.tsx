import { Extension } from '@tiptap/core';
import Suggestion, { SuggestionOptions } from '@tiptap/suggestion';
import { ReactRenderer, type Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { CheckSquare, CodeBlock, ImageSquare, ListBullets, ListNumbers, TextHOne, TextHTwo, TextHThree } from '@phosphor-icons/react';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import tippy, { Instance as TippyInstance, Props as TippyProps } from 'tippy.js';
import styles from './RichTextEditor.module.css';

// ─── Command definitions ────────────────────────────────────────────────────

export interface SlashCommand {
  title: string;
  shortcut?: string;
  icon: React.ReactNode;
  command: (params: { editor: Editor, range: { from: number; to: number } }) => void;
}

function getSlashCommands(): Omit<SlashCommand, 'command'>[] {
  return [
    { title: 'Título 1', shortcut: '⌘⌥1', icon: <TextHOne size={16} weight="regular" /> },
    { title: 'Título 2', shortcut: '⌘⌥2', icon: <TextHTwo size={16} weight="regular" /> },
    { title: 'Título 3', shortcut: '⌘⌥3', icon: <TextHThree size={16} weight="regular" /> },
    { title: 'Lista com marcadores', icon: <ListBullets size={16} weight="regular" /> },
    { title: 'Lista numerada', icon: <ListNumbers size={16} weight="regular" /> },
    { title: 'Item de ação', icon: <CheckSquare size={16} weight="regular" /> },
    { title: 'Bloco de código', icon: <CodeBlock size={16} weight="regular" /> },
    { title: 'Imagem', icon: <ImageSquare size={16} weight="regular" /> },
  ];
}

// ─── Slash Command List Component ─────────────────────────────────────────────

interface SlashCommandListProps {
  items: Omit<SlashCommand, 'command'>[];
  command: (item: Omit<SlashCommand, 'command'>) => void;
}

interface SlashCommandListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const SlashCommandList = forwardRef<SlashCommandListRef, SlashCommandListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => setSelectedIndex(0), [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex(i => (i + items.length - 1) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex(i => (i + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          if (items[selectedIndex]) command(items[selectedIndex]);
          return true;
        }
        return false;
      },
    }));

    if (!items.length) return null;

    return (
      // onMouseDown preventDefault keeps editor focus so blur doesn't fire
      // before the command runs (which would trigger a premature subtask sync).
      <div className={styles.slashMenu} onMouseDown={(e) => e.preventDefault()}>
        {items.map((item, idx) => (
          <button
            key={item.title}
            type="button"
            className={`${styles.slashItem} ${idx === selectedIndex ? styles.slashItemSelected : ''}`}
            onMouseEnter={() => setSelectedIndex(idx)}
            onClick={() => command(item)}
          >
            <span className={styles.slashItemIcon}>{item.icon}</span>
            <span className={styles.slashItemTitle}>{item.title}</span>
            {item.shortcut && (
              <span className={styles.slashItemShortcut}>{item.shortcut}</span>
            )}
          </button>
        ))}
      </div>
    );
  }
);
SlashCommandList.displayName = 'SlashCommandList';

// ─── Suggestion config ─────────────────────────────────────────────────────────

const ALL_COMMANDS = getSlashCommands();

function filterCommands(query: string) {
  if (!query) return ALL_COMMANDS;
  const q = query.toLowerCase();
  return ALL_COMMANDS.filter(c => c.title.toLowerCase().includes(q));
}

function moveCursorToTaskItemTextStart(editor: Editor) {
  const { state, view } = editor;
  const { $from } = state.selection;

  let taskItemDepth = -1;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === 'taskItem') {
      taskItemDepth = depth;
      break;
    }
  }

  if (taskItemDepth === -1) return;

  try {
    const taskItemPos = $from.before(taskItemDepth);
    const taskItemNode = $from.node(taskItemDepth);
    let textStartPos: number | null = null;

    taskItemNode.descendants((node, pos) => {
      if (node.isTextblock) {
        textStartPos = taskItemPos + pos + 1;
        return false;
      }
      return true;
    });

    if (textStartPos == null) {
      textStartPos = $from.start(taskItemDepth);
    }

    const tr = state.tr
      .setSelection(TextSelection.create(state.doc, textStartPos))
      .scrollIntoView();
    view.dispatch(tr);
  } catch {
    // Best-effort: if selection can't be created at this position, keep current cursor.
  }
}

function insertActionItemAtRange(editor: Editor, range: { from: number; to: number }) {
  editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContentAt(range.from, {
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: { checked: false },
          content: [{ type: 'paragraph' }],
        },
      ],
    })
    .run();
}

const suggestionConfig: Omit<SuggestionOptions, 'editor'> = {
  char: '/',
  allowSpaces: false,
  startOfLine: false,

  items: ({ query }) => filterCommands(query),

  render: () => {
    let renderer: ReactRenderer<SlashCommandListRef>;
    let popup: TippyInstance[];

    return {
      onStart(props) {
        renderer = new ReactRenderer(SlashCommandList, {
          props,
          editor: props.editor,
        });

        if (!props.clientRect) return;

        popup = tippy('body', {
          getReferenceClientRect: props.clientRect as () => DOMRect,
          appendTo: () => document.body,
          content: renderer.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
          popperOptions: {
            modifiers: [{ name: 'flip', enabled: true }],
          },
        } as Partial<TippyProps>);
      },

      onUpdate(props) {
        renderer.updateProps(props);
        if (props.clientRect) {
          popup[0].setProps({
            getReferenceClientRect: props.clientRect as () => DOMRect,
          });
        }
      },

      onKeyDown(props) {
        if (props.event.key === 'Escape') {
          popup[0].hide();
          return true;
        }
        return renderer.ref?.onKeyDown(props) ?? false;
      },

      onExit() {
        popup[0].destroy();
        renderer.destroy();
      },
    };
  },

  command: ({ editor, range, props }) => {
    const item = props as Omit<SlashCommand, 'command'>;
    editor.chain().focus().deleteRange(range).run();

    switch (item.title) {
      case 'Título 1':
        editor.chain().focus().toggleHeading({ level: 1 }).run();
        break;
      case 'Título 2':
        editor.chain().focus().toggleHeading({ level: 2 }).run();
        break;
      case 'Título 3':
        editor.chain().focus().toggleHeading({ level: 3 }).run();
        break;
      case 'Lista com marcadores':
        editor.chain().focus().toggleBulletList().run();
        break;
      case 'Lista numerada':
        editor.chain().focus().toggleOrderedList().run();
        break;
      case 'Item de ação':
        if (editor.isActive('taskList')) {
          editor.chain().focus().deleteRange(range).run();
        } else {
          insertActionItemAtRange(editor, range);
        }
        moveCursorToTaskItemTextStart(editor);
        requestAnimationFrame(() => moveCursorToTaskItemTextStart(editor));
        break;
      case 'Bloco de código':
        editor.chain().focus().toggleCodeBlock().run();
        break;
      case 'Imagem': {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/webp,image/gif';
        input.onchange = () => {
          const file = input.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (e) => {
            const src = e.target?.result as string;
            if (src) editor.chain().focus().setImage({ src }).run();
          };
          reader.readAsDataURL(file);
        };
        input.click();
        break;
      }
    }
  },
};

// ─── Extension ────────────────────────────────────────────────────────────────

export const SlashCommandExtension = Extension.create({
  name: 'slashCommand',
  addOptions() {
    return { suggestion: suggestionConfig };
  },
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
