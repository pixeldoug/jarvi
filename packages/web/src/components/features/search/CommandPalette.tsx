/**
 * CommandPalette — global search (⌘K, or "Buscar" in the Sidebar).
 *
 * Opens on the recent tasks and notes, mixed by last edit; the Tudo / Tarefas
 * / Notas tabs narrow both the recents and the results. Typing filters across
 * the app (actions, pages, Minha Conta pages, apps, categories, notes and
 * tasks), and each result shows where it matched, in bold. ↑↓ move, ↵ opens,
 * esc closes. The Sidebar renders it and passes its own handlers, so opening a
 * task view or category behaves exactly like the Sidebar items.
 *
 * Running a result closes the palette first: whatever it opens (Minha Conta,
 * an app dialog) replaces it, never stacks on it (compliance: one overlay).
 */

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ElementType,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bug,
  ChatCircle,
  CheckCircle,
  Checks,
  Circle,
  CirclesFour,
  Gear,
  Hash,
  Lightbulb,
  Microphone,
  Moon,
  Plugs,
  Plus,
  Repeat,
  Sun,
  X,
} from '@phosphor-icons/react';
import { Button, Dialog, Divider, ListItem, NewNoteIcon, NoteIcon, SegmentedControl } from '../../ui';
import { toast } from '../../ui/Sonner';
import { useTasks, type Task } from '../../../contexts/TaskContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { useNoteMutations, useNotesList } from '../../../hooks/useNotes';
import type { NoteListItem } from '../../../lib/notesApi';
import { captureProductEvent } from '../../../lib/productAnalytics';
import { formatFrequencyChip } from '../../../lib/recurrence';
import { formatTaskDate, isToday, parseDateString } from '../../../lib/utils';
import type { FeedbackKind } from '../../../lib/posthogFeedback';
import { APPS } from '../apps/AppConnectPages';
import { SIDEBAR_ITEMS, type SettingsPage } from '../account/SettingsDialog/SettingsDialog';
import { docToPlainText, formatDateChip, noteDay } from '../notes/noteText';
import {
  findMatchRanges,
  matchScore,
  snippetAround,
  tokenizeQuery,
  type SearchFields,
} from './commandSearch';
import styles from './CommandPalette.module.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type PaletteTab = 'all' | 'tasks' | 'notes';

const TABS: ReadonlyArray<{ value: PaletteTab; label: string }> = [
  { value: 'all', label: 'Tudo' },
  { value: 'tasks', label: 'Tarefas' },
  { value: 'notes', label: 'Notas' },
];

type GroupId =
  | 'actions'
  | 'recent'
  | 'navigation'
  | 'notes'
  | 'tasks'
  | 'categories'
  | 'apps'
  | 'settings';

const GROUP_LABELS: Record<GroupId, string> = {
  actions: 'Ações',
  recent: 'Recentes',
  navigation: 'Navegação',
  notes: 'Notas',
  tasks: 'Tarefas',
  categories: 'Categorias',
  apps: 'Apps',
  settings: 'Minha Conta',
};

/** Tie-break between groups while searching in Tudo */
const GROUP_ORDER: GroupId[] = [
  'actions',
  'recent',
  'navigation',
  'notes',
  'tasks',
  'categories',
  'apps',
  'settings',
];

/** Results per group while searching in Tudo */
const GROUP_LIMITS: Partial<Record<GroupId, number>> = { notes: 8, tasks: 8, categories: 6 };
/** Results while searching in the Tarefas or Notas tab */
const TAB_RESULTS_MAX = 50;

const RECENT_ITEMS = 10;

interface PaletteItem {
  key: string;
  group: GroupId;
  label: string;
  icon?: ElementType;
  iconNode?: ReactNode;
  /** Right side of the row (date, "Em breve"…) */
  meta?: string;
  /** Second line while searching, when `search.body` has nothing to quote */
  description?: string;
  search: SearchFields;
  /** Added to the match score (completed tasks sink below pending ones) */
  boost?: number;
  run: () => void;
}

interface PaletteGroup {
  id: GroupId;
  items: PaletteItem[];
}

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Array<{ id: string; name: string; count: number }>;
  /** The Sidebar's task view handler (page callback on /tasks, router state elsewhere) */
  onSelectList: (list: 'all' | 'recurring') => void;
  onSelectCategory: (name: string) => void;
  onOpenSettings: (page: SettingsPage) => void;
  onOpenFeedback: (kind: FeedbackKind) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SETTINGS_KEYWORDS: Partial<Record<SettingsPage, string>> = {
  profile: 'conta nome email senha foto perfil configuracoes',
  payments: 'plano assinatura upgrade pro cobranca cartao fatura pagamento',
  notifications: 'lembretes avisos alertas notificacao',
  memory: 'lembrar contexto preferencias',
  categories: 'tags etiquetas categoria',
  tasks: 'recap vencidas atrasadas revisar tarefas',
  appearance: 'tema escuro claro modo cores fundo aparencia',
};

/** "agora", "há 5 min", "há 3 h", "Ontem", then the day */
function formatShortAgo(iso: string, now = Date.now()): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const minutes = Math.floor((now - time) / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (new Date(time).toDateString() === yesterday.toDateString()) return 'Ontem';
  return formatDateChip(iso);
}

function formatTaskDay(task: Task): string | null {
  if (!task.due_date) return null;
  const time = task.time?.trim() ? `, ${task.time.trim()}` : '';
  if (isToday(task.due_date)) return `Hoje${time}`;
  const date = parseDateString(task.due_date);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date && date.toDateString() === tomorrow.toDateString()) return `Amanhã${time}`;
  return formatTaskDate(task.due_date, task.time);
}

/** Task descriptions may be a TipTap doc, HTML or plain text. */
function descriptionToText(description: string | undefined): string {
  if (!description) return '';
  const trimmed = description.trim();
  if (trimmed.startsWith('{')) return docToPlainText(trimmed);
  return trimmed
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * One row per recurring series: its occurrences share the title, so only the
 * next pending one stays (tasks arrive sorted by date).
 */
function dedupeRecurringTasks(tasks: Task[]): Task[] {
  const seen = new Set<string>();
  const ordered = [...tasks].sort((a, b) => Number(a.completed) - Number(b.completed));
  return ordered.filter((task) => {
    const series = task.recurrence_parent_id ?? (task.recurrence_type && task.recurrence_type !== 'none' ? task.id : null);
    if (!series) return true;
    if (seen.has(series)) return false;
    seen.add(series);
    return true;
  });
}

const updatedAtMs = (row: { updated_at: string }): number => Date.parse(row.updated_at) || 0;
const byRecency = (a: { updated_at: string }, b: { updated_at: string }) => updatedAtMs(b) - updatedAtMs(a);

/** Recents show when it was last edited; results show the note's day. */
function noteItem(note: NoteListItem, group: 'notes' | 'recent', run: () => void): PaletteItem {
  const title = note.title.trim() || 'Nova nota';
  const day = note.date_removed ? null : formatDateChip(noteDay(note));
  return {
    key: `${group}:note:${note.id}`,
    group,
    label: title,
    icon: note.has_transcript ? Microphone : NoteIcon,
    meta: group === 'recent' ? formatShortAgo(note.updated_at) : day ?? undefined,
    search: { title, keywords: note.category ?? undefined, body: note.preview },
    run,
  };
}

/** Recents show when it was last edited; results show when it is due. */
function taskItem(task: Task, group: 'tasks' | 'recent', run: () => void): PaletteItem {
  const frequency = formatFrequencyChip(task.recurrence_type, task.recurrence_config);
  const details = [frequency, task.category ? `# ${task.category}` : null].filter(Boolean).join(' · ');
  return {
    key: `${group}:task:${task.id}`,
    group,
    label: task.title,
    icon: task.completed ? CheckCircle : Circle,
    meta:
      group === 'recent'
        ? formatShortAgo(task.updated_at)
        : task.completed
          ? 'Concluída'
          : formatTaskDay(task) ?? undefined,
    description: details || undefined,
    search: { title: task.title, keywords: task.category, body: descriptionToText(task.description) },
    boost: task.completed ? -10 : 0,
    run,
  };
}

/** A result's second line: where its body matched, or its description. */
function resultDescription(item: PaletteItem, tokens: string[]): string | undefined {
  const body = item.search.body?.trim();
  return body ? snippetAround(body, tokens) : item.description;
}

/** `text` with the query's words in bold. */
function highlight(text: string, tokens: string[]): ReactNode {
  const ranges = findMatchRanges(text, tokens);
  if (ranges.length === 0) return text;
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark key={start} className={styles.match}>
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CommandPalette({ isOpen, onClose, ...props }: CommandPaletteProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      width="lg"
      showCloseButton={false}
      className={styles.dialog}
      contentClassName={styles.dialogContent}
      overlayClassName={styles.overlay}
    >
      {/* Mounted only while open: it starts on Tudo with an empty query */}
      <CommandPaletteBody onClose={onClose} {...props} />
    </Dialog>
  );
}

function CommandPaletteBody({
  onClose,
  categories,
  onSelectList,
  onSelectCategory,
  onOpenSettings,
  onOpenFeedback,
}: Omit<CommandPaletteProps, 'isOpen'>) {
  const navigate = useNavigate();
  const { tasks } = useTasks();
  const { isLight, toggleTheme } = useTheme();
  const { createNote } = useNoteMutations();
  const notesQuery = useNotesList();
  const notes = notesQuery.data;

  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<PaletteTab>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ── Items ─────────────────────────────────────────────────────────────────

  const staticItems = useMemo(() => {
    const createNoteAndOpen = async () => {
      try {
        const created = await createNote();
        captureProductEvent('note_created', { source: 'command_palette' });
        navigate(`/notes/${created.id}`);
      } catch (error) {
        console.error('Failed to create note:', error);
        toast.error('Não foi possível criar a nota.');
      }
    };

    const actions: PaletteItem[] = [
      {
        key: 'action:new-note',
        group: 'actions',
        label: 'Nova nota',
        icon: NewNoteIcon,
        description: 'Cria uma nota em branco e abre.',
        search: { title: 'Nova nota', keywords: 'criar nota anotar reuniao escrever' },
        run: () => void createNoteAndOpen(),
      },
      {
        key: 'action:new-category',
        group: 'actions',
        label: 'Nova categoria',
        icon: Plus,
        description: 'Abre Categorias em Minha Conta para criar uma.',
        search: { title: 'Nova categoria', keywords: 'criar categoria tag etiqueta' },
        run: () => onOpenSettings('categories'),
      },
      {
        key: 'action:theme',
        group: 'actions',
        label: isLight ? 'Ativar modo escuro' : 'Ativar modo claro',
        icon: isLight ? Moon : Sun,
        description: 'Troca o tema do app.',
        search: {
          title: isLight ? 'Ativar modo escuro' : 'Ativar modo claro',
          keywords: 'tema aparencia escuro claro dark light noturno',
        },
        run: toggleTheme,
      },
      {
        key: 'action:ideas',
        group: 'actions',
        label: 'Sugerir ideias',
        icon: Lightbulb,
        description: 'Conte para o time o que você gostaria de ver na Jarvi.',
        search: { title: 'Sugerir ideias', keywords: 'feedback sugestao ideia' },
        run: () => onOpenFeedback('ideas'),
      },
      {
        key: 'action:report',
        group: 'actions',
        label: 'Reportar problema',
        icon: Bug,
        description: 'Avise o time sobre algo que não funcionou.',
        search: { title: 'Reportar problema', keywords: 'bug erro feedback falha' },
        run: () => onOpenFeedback('report'),
      },
    ];

    const navigation: PaletteItem[] = [
      {
        key: 'nav:tasks',
        group: 'navigation',
        label: 'Tarefas',
        icon: Checks,
        description: 'Todas as suas tarefas por data, em lista ou calendário.',
        search: {
          title: 'Tarefas',
          keywords: 'minhas tarefas lista calendario agenda hoje vencidas caixa de entrada',
        },
        run: () => onSelectList('all'),
      },
      {
        key: 'nav:recurring',
        group: 'navigation',
        label: 'Recorrentes',
        icon: Repeat,
        description: 'As tarefas que se repetem.',
        search: { title: 'Recorrentes', keywords: 'repetir rotina recorrencia diaria semanal' },
        run: () => onSelectList('recurring'),
      },
      {
        key: 'nav:notes',
        group: 'navigation',
        label: 'Notas',
        icon: NoteIcon,
        description: 'Suas notas, gravações e resumos.',
        search: { title: 'Notas', keywords: 'reunioes anotacoes gravacoes transcricao resumo' },
        run: () => navigate('/notes'),
      },
      {
        key: 'nav:chats',
        group: 'navigation',
        label: 'Chats',
        icon: ChatCircle,
        description: 'Suas conversas com a Jarvi, para retomar quando quiser.',
        search: { title: 'Chats', keywords: 'conversas historico assistente ia jarvi' },
        run: () => navigate('/chats'),
      },
      {
        key: 'nav:apps',
        group: 'navigation',
        label: 'Apps',
        icon: CirclesFour,
        description: 'Conecte a Jarvi ao WhatsApp, aos assistentes de IA e a outros apps.',
        search: { title: 'Apps', keywords: 'integracoes conectar whatsapp aplicativos' },
        run: () => navigate('/apps'),
      },
      {
        key: 'nav:account',
        group: 'navigation',
        label: 'Minha Conta',
        icon: Gear,
        description: 'Perfil, pagamentos, notificações, memória, categorias, tarefas e aparência.',
        search: { title: 'Minha Conta', keywords: 'configuracoes ajustes conta perfil preferencias' },
        run: () => onOpenSettings('profile'),
      },
    ];

    const settings: PaletteItem[] = SIDEBAR_ITEMS.map((page) => ({
      key: `settings:${page.id}`,
      group: 'settings',
      label: page.label,
      icon: page.icon,
      description: `Abre ${page.label} em Minha Conta.`,
      search: { title: page.label, keywords: `minha conta configuracoes ${SETTINGS_KEYWORDS[page.id] ?? ''}` },
      run: () => onOpenSettings(page.id),
    }));

    const apps: PaletteItem[] = APPS.map((app) => ({
      key: `app:${app.id}`,
      group: 'apps',
      label: app.name,
      ...(app.id === 'ai'
        ? { icon: Plugs }
        : { iconNode: <img src={app.icon} alt="" className={styles.appLogo} draggable={false} /> }),
      meta: app.available ? undefined : 'Em breve',
      search: {
        title: app.name,
        keywords: `app integracao conectar ${app.id === 'ai' ? 'chatgpt claude mcp' : ''}`,
        body: app.description,
      },
      run: () => navigate(app.available ? `/apps?app=${app.id}` : '/apps'),
    }));

    return { actions, navigation, settings, apps };
  }, [createNote, navigate, isLight, toggleTheme, onOpenSettings, onOpenFeedback, onSelectList]);

  const categoryItems = useMemo<PaletteItem[]>(
    () =>
      categories.map((category) => ({
        key: `category:${category.id}`,
        group: 'categories',
        label: category.name,
        icon: Hash,
        meta: category.count > 0 ? String(category.count) : undefined,
        description:
          category.count === 1
            ? '1 tarefa pendente nesta categoria.'
            : `${category.count} tarefas pendentes nesta categoria.`,
        search: { title: category.name, keywords: 'categoria' },
        run: () => onSelectCategory(category.name),
      })),
    [categories, onSelectCategory],
  );

  const noteItems = useMemo(
    () => (notes ?? []).map((note) => noteItem(note, 'notes', () => navigate(`/notes/${note.id}`))),
    [notes, navigate],
  );

  const taskItems = useMemo(
    () =>
      dedupeRecurringTasks(tasks).map((task) =>
        taskItem(task, 'tasks', () => navigate('/tasks', { state: { openTaskId: task.id } })),
      ),
    [tasks, navigate],
  );

  /** Last edited first; pending tasks only (finished ones are still found by searching). */
  const recentItems = useMemo<Record<PaletteTab, PaletteItem[]>>(() => {
    const noteRows = [...(notes ?? [])]
      .sort(byRecency)
      .slice(0, RECENT_ITEMS)
      .map((note) => ({
        at: updatedAtMs(note),
        item: noteItem(note, 'recent', () => navigate(`/notes/${note.id}`)),
      }));
    const taskRows = dedupeRecurringTasks(tasks)
      .filter((task) => !task.completed)
      .sort(byRecency)
      .slice(0, RECENT_ITEMS)
      .map((task) => ({
        at: updatedAtMs(task),
        item: taskItem(task, 'recent', () => navigate('/tasks', { state: { openTaskId: task.id } })),
      }));
    return {
      all: [...noteRows, ...taskRows]
        .sort((a, b) => b.at - a.at)
        .slice(0, RECENT_ITEMS)
        .map((row) => row.item),
      tasks: taskRows.map((row) => row.item),
      notes: noteRows.map((row) => row.item),
    };
  }, [notes, tasks, navigate]);

  // ── Results ───────────────────────────────────────────────────────────────

  const tokens = useMemo(() => tokenizeQuery(query), [query]);
  const isSearching = tokens.length > 0;

  const groups = useMemo<PaletteGroup[]>(() => {
    if (tokens.length === 0) {
      const items = recentItems[tab];
      return items.length > 0 ? [{ id: 'recent' as const, items }] : [];
    }

    const candidates =
      tab === 'tasks'
        ? taskItems
        : tab === 'notes'
          ? noteItems
          : [
              ...staticItems.actions,
              ...staticItems.navigation,
              ...noteItems,
              ...taskItems,
              ...categoryItems,
              ...staticItems.apps,
              ...staticItems.settings,
            ];

    const byGroup = new Map<GroupId, Array<{ item: PaletteItem; score: number; order: number }>>();
    candidates.forEach((item, order) => {
      const score = matchScore(tokens, item.search);
      if (score === null) return;
      const bucket = byGroup.get(item.group) ?? [];
      bucket.push({ item, score: score + (item.boost ?? 0), order });
      byGroup.set(item.group, bucket);
    });

    const ranked = [...byGroup.entries()].map(([id, matches]) => {
      matches.sort((a, b) => b.score - a.score || a.order - b.order);
      const limit = tab === 'all' ? GROUP_LIMITS[id] ?? matches.length : TAB_RESULTS_MAX;
      return { id, best: matches[0].score, items: matches.slice(0, limit).map((match) => match.item) };
    });

    // The group holding the best match comes first.
    ranked.sort((a, b) => b.best - a.best || GROUP_ORDER.indexOf(a.id) - GROUP_ORDER.indexOf(b.id));
    return ranked.map(({ id, items }) => ({ id, items }));
  }, [tokens, tab, recentItems, staticItems, noteItems, taskItems, categoryItems]);

  const flatItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const safeIndex = Math.min(activeIndex, Math.max(flatItems.length - 1, 0));
  const activeItem = flatItems[safeIndex];

  useEffect(() => {
    setActiveIndex(0);
    listRef.current?.scrollTo({ top: 0 });
  }, [query, tab]);

  useEffect(() => {
    if (!activeItem) return;
    const element = document.getElementById(optionId(listboxId, activeItem.key));
    element?.scrollIntoView({ block: 'nearest' });
  }, [activeItem, listboxId]);

  const runItem = (item: PaletteItem) => {
    onClose();
    item.run();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    const count = flatItems.length;
    if (event.key === 'ArrowDown' && count > 0) {
      event.preventDefault();
      setActiveIndex((safeIndex + 1) % count);
    } else if (event.key === 'ArrowUp' && count > 0) {
      event.preventDefault();
      setActiveIndex((safeIndex - 1 + count) % count);
    } else if (event.key === 'Enter' && activeItem) {
      event.preventDefault();
      runItem(activeItem);
    }
  };

  const changeTab = (next: PaletteTab) => {
    setTab(next);
    // Keep typing right away (arrow keys on the tabs move their own focus back)
    inputRef.current?.focus();
  };

  const clearQuery = () => {
    setQuery('');
    inputRef.current?.focus();
  };

  const notesLoading = notesQuery.isLoading && tab !== 'tasks';
  const emptyMessage = isSearching
    ? notesLoading
      ? 'Buscando…'
      : `Nada encontrado para “${query.trim()}”.`
    : notesLoading
      ? 'Carregando…'
      : tab === 'tasks'
        ? 'Nenhuma tarefa pendente.'
        : tab === 'notes'
          ? 'Nenhuma nota ainda.'
          : 'Suas tarefas e notas recentes aparecem aqui.';

  // A tab of one kind needs no group headers while searching.
  const showGroupLabels = !isSearching || tab === 'all';

  let flatIndex = -1;

  return (
    <div className={styles.palette}>
      <div className={styles.searchRow}>
        <input
          ref={inputRef}
          className={styles.searchInput}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar tarefas, notas, páginas…"
          aria-label="Buscar no app"
          role="combobox"
          aria-expanded
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeItem ? optionId(listboxId, activeItem.key) : undefined}
          autoComplete="off"
          spellCheck={false}
        />
        {query && (
          <>
            <Button variant="ghost" size="small" onClick={clearQuery}>
              Limpar
            </Button>
            <Divider orientation="vertical" className={styles.headerDivider} />
          </>
        )}
        <Button
          variant="ghost"
          size="small"
          icon={X}
          iconPosition="icon-only"
          aria-label="Fechar"
          onClick={onClose}
        />
      </div>

      <div className={styles.tabs}>
        <SegmentedControl items={TABS} value={tab} onChange={changeTab} aria-label="Filtrar por tipo" />
      </div>

      <div ref={listRef} className={styles.results} id={listboxId} role="listbox" aria-label="Resultados">
        {groups.map((group) => (
          <div key={group.id} role="group" aria-label={GROUP_LABELS[group.id]} className={styles.group}>
            {showGroupLabels && (
              <div className={styles.groupLabel} aria-hidden>
                {GROUP_LABELS[group.id]}
              </div>
            )}
            {group.items.map((item) => {
              flatIndex += 1;
              const index = flatIndex;
              const highlighted = index === safeIndex;
              const description = isSearching ? resultDescription(item, tokens) : undefined;
              return (
                <ListItem
                  key={item.key}
                  label={isSearching ? highlight(item.label, tokens) : item.label}
                  description={description ? highlight(description, tokens) : undefined}
                  icon={item.icon}
                  iconNode={item.iconNode}
                  trailing={item.meta ? <span className={styles.meta}>{item.meta}</span> : undefined}
                  className={`${styles.option} ${description ? styles.optionTwoLines : styles.optionOneLine}`}
                  onClick={() => runItem(item)}
                  buttonProps={{
                    id: optionId(listboxId, item.key),
                    role: 'option',
                    'aria-selected': highlighted,
                    tabIndex: -1,
                    'data-highlighted': highlighted || undefined,
                    // Keep the focus (and the caret) in the search field.
                    onMouseDown: (event) => event.preventDefault(),
                    onMouseMove: () => {
                      if (index !== safeIndex) setActiveIndex(index);
                    },
                  }}
                />
              );
            })}
          </div>
        ))}

        {flatItems.length === 0 && <p className={styles.empty}>{emptyMessage}</p>}
      </div>
    </div>
  );
}

function optionId(listboxId: string, key: string): string {
  return `${listboxId}-option-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}
