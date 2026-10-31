/**
 * OverdueRecapScreen — "Recap", the overdue tasks one at a time in a
 * full-screen takeover (Slack's Catch up). Each task is shown big in the
 * middle; swipe it right (or →) to complete it, left (or ←) to leave it for
 * now, or use Ignorar / Concluir / Reagendar (Hoje, Amanhã, Escolher data).
 * A completion or a new date can be undone from its toast or with ⌘Z while
 * the Recap is open. It ends on a "Tudo revisado!" screen.
 *
 * The queue is the overdue items as they were when the Recap opened, so tasks
 * don't jump when the list refetches. Each one is read live and drops out if
 * it was completed, rescheduled or deleted elsewhere meanwhile. A recurring
 * series is one item: Concluir completes all its overdue occurrences, and it
 * has no Reagendar (the series already has its next date).
 *
 * A takeover like TrialExpiredGate, not a Dialog: one overlay, portaled, with
 * `role="dialog"` so the app's "another dialog is open" checks see it. The
 * date picker swaps the content in place (compliance: one overlay).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  AnimatePresence,
  MotionConfig,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
  type Variants,
} from 'motion/react';
import {
  CalendarBlank,
  CaretLeft,
  Check,
  CheckCircle,
  Flag,
  Repeat,
  SunHorizon,
  Tray,
  X,
} from '@phosphor-icons/react';
import { Button, Calendar, Chip, Dropdown, ListItem, Logo, toast } from '../../../ui';
import { useTasks, type Task } from '../../../../contexts/TaskContext';
import { useNotesList } from '../../../../hooks/useNotes';
import { captureProductEvent } from '../../../../lib/productAnalytics';
import { formatTaskDate, parseDateString } from '../../../../lib/utils';
import { capitalizeTaskTitle } from '../../../../lib/taskTitle';
import { formatFrequencyChip } from '../../../../lib/recurrence';
import { getTaskAppSource } from '../../../../lib/taskAppSource';
import {
  addDaysToDateKey,
  describeOverdue,
  findUpcomingOccurrence,
  isTaskOverdue,
  taskDateKey,
  toLocalDateKey,
  type OverdueRecapItem,
} from '../../../../lib/overdueRecap';
import type { OverdueRecapSession } from './useOverdueRecap';
import { RecapCelebration } from './RecapCelebration';
import styles from './OverdueRecapScreen.module.css';

// ── Types ────────────────────────────────────────────────────────────────────

/** Where a task leaves to (or comes back from, on undo) */
type Side = 'right' | 'left' | 'up' | 'down';

interface CardMotion {
  exit: Side;
  /** Set on undo: the task comes back from where it left */
  enterFrom: Side | null;
  /** prefers-reduced-motion: tasks fade in place instead of sliding */
  reduced: boolean;
}

type Entry =
  | { kind: 'complete'; item: OverdueRecapItem; position: number; taskIds: string[] }
  | { kind: 'reschedule'; item: OverdueRecapItem; position: number; taskId: string; from: string; to: string }
  | { kind: 'skip'; item: OverdueRecapItem; position: number };

type Input = 'swipe' | 'button' | 'key' | 'toast';
type RescheduleAction = 'today' | 'tomorrow' | 'date';
type View = 'card' | 'date';

const ENTRY_SIDE: Record<Entry['kind'], Side> = { complete: 'right', skip: 'left', reschedule: 'up' };

/** Above this many tasks the progress is one bar instead of one segment each */
const MAX_SEGMENTS = 12;

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
/** Portaled layers that belong to the Recap: its menu and the toasts */
const RECAP_LAYERS_SELECTOR = '[data-dialog-outside-click-ignore], [data-toast-container]';

// ── Motion ───────────────────────────────────────────────────────────────────

const SWIPE_DISTANCE = 120;
const SWIPE_VELOCITY = 600;
const OFFSCREEN_X = 560;
const EASE = [0.4, 0, 0.2, 1] as const;

const offscreen = (side: Side, reduced: boolean) => {
  if (reduced) return { x: 0, y: 0, scale: 1, opacity: 0 };
  switch (side) {
    case 'right':
      return { x: OFFSCREEN_X, y: 0, scale: 1, opacity: 0 };
    case 'left':
      return { x: -OFFSCREEN_X, y: 0, scale: 1, opacity: 0 };
    case 'up':
      return { x: 0, y: -48, scale: 0.98, opacity: 0 };
    case 'down':
      return { x: 0, y: 24, scale: 0.96, opacity: 0 };
  }
};

/** The tilt follows `x` (see SwipeCard), so no variant animates rotate. */
const CARD_VARIANTS: Variants = {
  // A new task rises into place; an undone one comes back from where it left.
  enter: ({ enterFrom, reduced }: CardMotion) => ({ ...offscreen(enterFrom ?? 'down', reduced), zIndex: 1 }),
  center: {
    x: 0,
    y: 0,
    scale: 1,
    opacity: 1,
    zIndex: 1,
    pointerEvents: 'auto',
    transition: { duration: 0.28, ease: EASE },
  },
  // The leaving task stays on top while it animates out: it must not take clicks meant for the next one.
  exit: ({ exit, reduced }: CardMotion) => ({
    ...offscreen(exit, reduced),
    zIndex: 2,
    pointerEvents: 'none',
    transition: { duration: 0.28, ease: EASE },
  }),
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** "27 out" / "27 out, 14:00" — the screen's lowercase date */
function formatShortDate(dueDate?: string, time?: string): string | null {
  const date = parseDateString(dueDate);
  if (!date) return null;
  const month = date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  const day = `${date.getDate()} ${month}`;
  return time ? `${day}, ${time}` : day;
}

/** "hoje", "amanhã" or "29 out" */
function describeUpcoming(task: Task, todayKey: string, tomorrowKey: string): string {
  const dueKey = taskDateKey(task);
  if (dueKey === todayKey) return 'hoje';
  if (dueKey === tomorrowKey) return 'amanhã';
  return formatShortDate(task.due_date) ?? dueKey ?? '';
}

// ── Screen ───────────────────────────────────────────────────────────────────

export interface OverdueRecapScreenProps {
  /** Null while closed */
  session: OverdueRecapSession | null;
  onClose: () => void;
}

export function OverdueRecapScreen({ session, onClose }: OverdueRecapScreenProps) {
  if (!session) return null;
  return createPortal(<RecapBody key={session.id} session={session} onClose={onClose} />, document.body);
}

function RecapBody({ session, onClose }: { session: OverdueRecapSession; onClose: () => void }) {
  const { items } = session;
  const { tasks, setTasksCompleted, updateTask } = useTasks();
  const { data: notes } = useNotesList();
  const [todayKey] = useState(() => toLocalDateKey(new Date()));
  const tomorrowKey = addDaysToDateKey(todayKey, 1);

  const liveById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  const [position, setPosition] = useState(0);
  const [history, setHistory] = useState<Entry[]>([]);
  const historyRef = useRef<Entry[]>([]);
  const [view, setView] = useState<View>('card');
  const [menuOpen, setMenuOpen] = useState(false);
  const reducedMotion = useReducedMotion() ?? false;
  const [cardSides, setCardMotion] = useState<Omit<CardMotion, 'reduced'>>({ exit: 'right', enterFrom: null });
  const cardMotion: CardMotion = { ...cardSides, reduced: reducedMotion };
  /**
   * The task an undo just brought back. Its revert reaches the cache a moment
   * later, so until then it still looks resolved and must not be dropped as
   * "done elsewhere". Released as soon as it shows as open again.
   */
  const restoredKeyRef = useRef<string | null>(null);
  /** Where the Recap is now; a handler from an older render (a task that already left) must not act. */
  const positionRef = useRef(0);
  positionRef.current = position;
  const rootRef = useRef<HTMLDivElement>(null);
  const rescheduleRef = useRef<HTMLDivElement | null>(null);
  // The leaving card detaches its anchor after the next one attached: ignore the null
  const setRescheduleAnchor = useCallback((node: HTMLDivElement | null) => {
    if (node) rescheduleRef.current = node;
  }, []);

  const commitHistory = (next: Entry[]) => {
    historyRef.current = next;
    setHistory(next);
  };

  /**
   * Each task's latest write, settled. A save, its undo and a new action on
   * the restored task all reach the server in the order they were made, so
   * an undo still running never overwrites what came after it.
   */
  const writesRef = useRef(new Map<string, Promise<void>>());
  const queueWrite = <T,>(taskIds: string[], write: () => Promise<T>): Promise<T> => {
    const before = Promise.all(taskIds.map((id) => writesRef.current.get(id)));
    const result = before.then(write);
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    taskIds.forEach((id) => writesRef.current.set(id, settled));
    return result;
  };

  const current: OverdueRecapItem | null = position < items.length ? items[position] : null;

  /** Overdue occurrences of the item still open right now */
  const openIdsOf = useCallback(
    (item: OverdueRecapItem) =>
      item.taskIds.filter((id) => {
        const task = liveById.get(id);
        return !!task && isTaskOverdue(task, todayKey);
      }),
    [liveById, todayKey],
  );
  const openIds = current ? openIdsOf(current) : [];
  const task: Task | null = current ? liveById.get(openIds[0] ?? current.task.id) ?? current.task : null;
  const title = task ? capitalizeTaskTitle(task.title) : '';
  const canChangeDate = !!current && !current.isRecurring;
  const upcoming = current?.isRecurring ? findUpcomingOccurrence(tasks, current.key, todayKey) : null;
  const noteTitle = task?.source_note_id
    ? notes?.find((note) => note.id === task.source_note_id)?.title || null
    : null;

  // A full-screen takeover: the page behind doesn't scroll.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Focus stays in the Recap: the button that was clicked leaves with its task,
  // and the done screen is a new root.
  const isDone = position >= items.length;
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, [position, isDone]);

  // Modal: Tab and Shift+Tab cycle inside the Recap, and focus that reaches the
  // page behind comes back. Its Reagendar menu (portaled, marked as a layer
  // above) and the toasts (Desfazer) are part of it.
  useEffect(() => {
    const inRecap = (node: Element) =>
      !!rootRef.current?.contains(node) || !!node.closest(RECAP_LAYERS_SELECTOR);
    const onKeyDown = (event: KeyboardEvent) => {
      const root = rootRef.current;
      if (event.key !== 'Tab' || event.defaultPrevented || !root) return;
      const active = document.activeElement;
      // In the menu (it moves between its items) or a toast: the focusin guard catches a way out
      if (active && !root.contains(active) && inRecap(active)) return;
      const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (node) => node.getClientRects().length > 0,
      );
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const atEdge = event.shiftKey
        ? active === first || active === root || !root.contains(active)
        : active === last || !root.contains(active);
      if (!atEdge) return;
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    };
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Element && !inRecap(event.target)) {
        rootRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, []);

  // The Reagendar menu is portaled outside the Recap, so the Tab order never
  // reaches it: it takes focus when it opens, moves between its items with
  // ↑ ↓ Home End and Tab, and Escape gives focus back to Reagendar.
  const focusFirstMenuItem = useCallback((menu: HTMLDivElement | null) => {
    menu?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, []);
  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const menuItems = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    if (menuItems.length === 0) return;
    const index = menuItems.findIndex((item) => item === document.activeElement);
    const forward = index < 0 ? 0 : index + 1;
    const back = index < 0 ? menuItems.length - 1 : index - 1;
    let next: number;
    switch (event.key) {
      case 'ArrowDown':
        next = forward;
        break;
      case 'ArrowUp':
        next = back;
        break;
      case 'Tab':
        next = event.shiftKey ? back : forward;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = menuItems.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    menuItems[(next + menuItems.length) % menuItems.length].focus();
  };
  const focusRescheduleButton = () => {
    rescheduleRef.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  };

  // Resolved elsewhere meanwhile (another tab, WhatsApp, the agent): skip it.
  useEffect(() => {
    if (!current || view !== 'card') return;
    if (restoredKeyRef.current === current.key) {
      if (openIds.length > 0) restoredKeyRef.current = null;
      return;
    }
    if (openIds.length > 0) return;
    // Resolved here, with the cache ahead of the position for a render: not "elsewhere"
    if (historyRef.current.some((entry) => entry.item.key === current.key)) return;
    setPosition((p) => p + 1);
  }, [current, openIds.length, view]);

  // ── Analytics on close ──
  const counts = useMemo(() => {
    const byKind = { complete: 0, reschedule: 0, skip: 0 };
    for (const entry of history) byKind[entry.kind] += 1;
    return byKind;
  }, [history]);

  const statsRef = useRef({ counts, position, total: items.length });
  statsRef.current = { counts, position, total: items.length };
  useEffect(
    () => () => {
      const stats = statsRef.current;
      captureProductEvent('overdue_recap_closed', {
        trigger: session.trigger,
        completed: stats.counts.complete,
        rescheduled: stats.counts.reschedule,
        skipped: stats.counts.skip,
        remaining: Math.max(stats.total - stats.position, 0),
        finished: stats.position >= stats.total,
      });
    },
    [session.trigger],
  );

  const track = (action: Entry['kind'] | RescheduleAction, input: Input, occurrences = 1) =>
    captureProductEvent('overdue_recap_task_actioned', { action, input, occurrences });

  // ── Actions ──

  const moveOn = (entry: Entry) => {
    restoredKeyRef.current = null;
    setMenuOpen(false);
    setCardMotion({ exit: ENTRY_SIDE[entry.kind], enterFrom: null });
    commitHistory([...historyRef.current, entry]);
    setView('card');
    setPosition(entry.position + 1);
  };

  /** A save failed and the cache is already reverted: bring the task back if nothing came after it. */
  const restoreAfterFailure = (entry: Entry, message: string) => {
    toast.error(message);
    const entries = historyRef.current;
    if (!entries.includes(entry)) return;
    const wasLast = entries[entries.length - 1] === entry;
    commitHistory(entries.filter((e) => e !== entry));
    if (!wasLast) return;
    restoredKeyRef.current = entry.item.key;
    setCardMotion({ exit: 'down', enterFrom: ENTRY_SIDE[entry.kind] });
    setView('card');
    setPosition(entry.position);
  };

  /** "Desfazer" on a toast: only while that action is still the last one */
  const offerUndo = (entry: Entry, message: string) => {
    toast.success(message, {
      hasButton: true,
      duration: 4000,
      action: {
        label: 'Desfazer',
        onClick: () => {
          const entries = historyRef.current;
          if (entries[entries.length - 1] === entry) undo('toast');
        },
      },
    });
  };

  /** False when this handler belongs to a task that is no longer the current one */
  const isCurrentRender = () => positionRef.current === position;

  const complete = (input: Input): boolean => {
    if (!current || !task || openIds.length === 0 || !isCurrentRender()) return false;
    const entry: Entry = { kind: 'complete', item: current, position, taskIds: openIds };
    // Move on first: the optimistic cache update must never render with this task still current
    moveOn(entry);
    const ids = openIds;
    const pending = queueWrite(ids, () => setTasksCompleted(ids, true));
    track('complete', input, openIds.length);
    captureProductEvent('task_completed', {
      task_id: task.id,
      priority: task.priority,
      had_due_date: true,
      had_category: !!task.category,
      was_important: !!task.important,
      had_recurrence: current.isRecurring,
      source: 'overdue_recap',
      occurrences: openIds.length,
    });
    offerUndo(entry, openIds.length > 1 ? `${openIds.length} tarefas concluídas` : 'Tarefa concluída');
    pending.catch(() => restoreAfterFailure(entry, `Não foi possível concluir “${title}”.`));
    return true;
  };

  const skip = (input: Input): boolean => {
    if (!current || !isCurrentRender()) return false;
    moveOn({ kind: 'skip', item: current, position });
    track('skip', input);
    return true;
  };

  const reschedule = (toKey: string, action: RescheduleAction, input: Input) => {
    if (!current || !task || !canChangeDate || !isCurrentRender()) return;
    const from = taskDateKey(task);
    if (!from) return;
    const entry: Entry = {
      kind: 'reschedule',
      item: current,
      position,
      taskId: task.id,
      from,
      to: toKey,
    };
    moveOn(entry);
    const taskId = task.id;
    const pending = queueWrite([taskId], () => updateTask(taskId, { dueDate: toKey }));
    track(action, input);
    const when =
      toKey === todayKey ? 'hoje' : toKey === tomorrowKey ? 'amanhã' : formatShortDate(toKey) ?? toKey;
    offerUndo(entry, `Reagendada para ${when}`);
    pending.catch(() => restoreAfterFailure(entry, `Não foi possível reagendar “${title}”.`));
  };

  const undo = (input: Input) => {
    const entries = historyRef.current;
    const entry = entries[entries.length - 1];
    if (!entry) return;
    commitHistory(entries.slice(0, -1));
    // An ignored task changed nothing, so nothing is on its way back
    restoredKeyRef.current = entry.kind === 'skip' ? null : entry.item.key;
    setMenuOpen(false);
    setCardMotion({ exit: 'down', enterFrom: ENTRY_SIDE[entry.kind] });
    setView('card');
    setPosition(entry.position);
    captureProductEvent('overdue_recap_action_undone', { action: entry.kind, input });
    const undoFailed = () => toast.error('Não foi possível desfazer.');
    // Queued after the save it reverses (whatever its outcome) and before any new action on the task
    if (entry.kind === 'complete') {
      void queueWrite(entry.taskIds, () => setTasksCompleted(entry.taskIds, false)).catch(undoFailed);
    } else if (entry.kind === 'reschedule') {
      void queueWrite([entry.taskId], () => updateTask(entry.taskId, { dueDate: entry.from })).catch(undoFailed);
    }
  };

  // ── Keyboard: → ← H A D, ⌘Z, Escape ──
  // Capture phase on window: runs before the Dropdown's own Escape listener, while `menuOpen` is still current.
  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {});
  keyHandlerRef.current = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;

    const mod = event.metaKey || event.ctrlKey;
    if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'z') {
      if (historyRef.current.length === 0) return;
      event.preventDefault();
      undo('key');
      return;
    }
    if (event.key === 'Escape') {
      // Closes one layer: the Reagendar menu, the date view, then the Recap
      event.preventDefault();
      event.stopPropagation();
      if (menuOpen) {
        setMenuOpen(false);
        focusRescheduleButton();
      } else if (view !== 'card') setView('card');
      else onClose();
      return;
    }
    if (mod || event.altKey || event.repeat || menuOpen || view !== 'card' || !current) return;

    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        complete('key');
        break;
      case 'ArrowLeft':
        event.preventDefault();
        skip('key');
        break;
      case 'h':
      case 'H':
        if (canChangeDate) reschedule(todayKey, 'today', 'key');
        break;
      case 'a':
      case 'A':
        if (canChangeDate) reschedule(tomorrowKey, 'tomorrow', 'key');
        break;
      case 'd':
      case 'D':
        if (canChangeDate) setView('date');
        break;
    }
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => keyHandlerRef.current(event);
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  // ── Render ──

  const done = current === null;
  const total = items.length;
  const shownPosition = Math.min(position + 1, total);

  if (done) {
    return (
      <div
        ref={rootRef}
        className={`${styles.screen} ${styles.doneScreen}`}
        role="dialog"
        aria-modal="true"
        aria-label="Recap concluído"
        tabIndex={-1}
        data-toast-floor
      >
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div className={styles.brand}>
              <Logo />
            </div>
            {/* Dark tokens for the controls on the accent background; the logo keeps its own tile */}
            <div className={styles.headerEnd} data-theme="dark">
              <Button
                type="button"
                variant="ghost"
                size="medium"
                icon={X}
                iconPosition="icon-only"
                aria-label="Fechar"
                onClick={onClose}
              />
            </div>
          </div>
        </header>
        <main className={styles.main}>
          <motion.div
            className={styles.done}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
          >
            <RecapCelebration className={styles.celebration} />
            <h1 className={styles.doneTitle}>Tudo revisado!</h1>
            <p className={styles.doneText}>
              As tarefas atrasadas foram revisadas. Agora você pode seguir em frente.
            </p>
            <div className={styles.doneAction} data-theme="dark">
              <Button type="button" variant="secondary" fullWidth onClick={onClose}>
                Continuar
              </Button>
            </div>
          </motion.div>
        </main>
      </div>
    );
  }

  const segmented = total <= MAX_SEGMENTS;
  const appSource = task ? getTaskAppSource(task) : null;
  const sourceLabel = appSource?.noteId ? noteTitle || appSource.name : appSource?.name;
  const frequency = current?.isRecurring && task ? formatFrequencyChip(task.recurrence_type, task.recurrence_config) : null;
  const dueKey = task ? taskDateKey(task) : null;
  const overdueLabel =
    openIds.length > 1
      ? `${openIds.length} vencidas desde ${formatShortDate(current?.oldestDueDate) ?? current?.oldestDueDate}`
      : dueKey
        ? describeOverdue(dueKey, todayKey)
        : 'Vencida';

  return (
    <MotionConfig reducedMotion="user">
      <div
        ref={rootRef}
        className={styles.screen}
        role="dialog"
        aria-modal="true"
        aria-label="Recap das tarefas vencidas"
        tabIndex={-1}
        data-toast-floor
      >
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div className={styles.brand}>
              <Logo />
              <span className={styles.brandName}>Recap</span>
            </div>

            <div className={styles.progress}>
              <span className={styles.progressLabel} aria-live="polite">
                {shownPosition} de {total}
              </span>
              {segmented ? (
                <div className={styles.segments} aria-hidden="true">
                  {items.map((item, index) => (
                    <span
                      key={item.key}
                      className={`${styles.segment} ${index <= position ? styles.segmentFilled : ''}`}
                    />
                  ))}
                </div>
              ) : (
                <div className={styles.segments} aria-hidden="true">
                  <span className={styles.segment}>
                    <span className={styles.segmentFill} style={{ width: `${(shownPosition / total) * 100}%` }} />
                  </span>
                </div>
              )}
            </div>

            <div className={styles.headerEnd}>
              <Button
                type="button"
                variant="secondary"
                size="medium"
                icon={X}
                iconPosition="icon-only"
                aria-label="Fechar"
                onClick={onClose}
              />
            </div>
          </div>
        </header>

        <main className={styles.main}>
          <div className={styles.stage}>
            <AnimatePresence initial={false} custom={cardMotion}>
              {current && task && (
                <SwipeCard
                  key={current.key}
                  motionState={cardMotion}
                  draggable={view === 'card'}
                  onSwipe={(side) => (side === 'right' ? complete('swipe') : skip('swipe'))}
                >
                  <Chip
                    label={overdueLabel}
                    icon={<span className={styles.overdueDot} aria-hidden="true" />}
                    size="small"
                  />
                  <h1 className={styles.title}>{title}</h1>

                  {view === 'date' ? (
                    <div className={styles.datePanel}>
                      <Calendar
                        className={styles.calendar}
                        minDate={parseDateString(todayKey) ?? new Date()}
                        onDateSelect={(date) => reschedule(toLocalDateKey(date), 'date', 'button')}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="small"
                        icon={CaretLeft}
                        iconPosition="left"
                        onClick={() => setView('card')}
                      >
                        Voltar
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className={styles.chips}>
                        {task.due_date && (
                          <Chip
                            label={formatShortDate(task.due_date, task.time) ?? formatTaskDate(task.due_date) ?? ''}
                            icon={<CalendarBlank size={16} weight="regular" />}
                            size="medium"
                          />
                        )}
                        {frequency && (
                          <Chip label={frequency} icon={<Repeat size={16} weight="regular" />} size="medium" />
                        )}
                        {task.category && <Chip label={task.category} size="medium" />}
                        {appSource && sourceLabel && (
                          <Chip
                            label={sourceLabel}
                            icon={
                              appSource.Icon ? (
                                <appSource.Icon size={16} weight="regular" />
                              ) : (
                                <img src={appSource.icon} alt="" />
                              )
                            }
                            size="medium"
                          />
                        )}
                      </div>

                      <div className={styles.actions}>
                        <Button type="button" variant="secondary" icon={Tray} iconPosition="left" onClick={() => skip('button')}>
                          Ignorar
                        </Button>
                        <Button
                          type="button"
                          variant="primary"
                          icon={CheckCircle}
                          iconPosition="left"
                          disabled={openIds.length === 0}
                          onClick={() => complete('button')}
                        >
                          {openIds.length > 1 ? `Concluir as ${openIds.length}` : 'Concluir'}
                        </Button>
                        {canChangeDate && (
                          <div ref={setRescheduleAnchor} className={styles.menuAnchor}>
                            <Button
                              type="button"
                              variant="secondary"
                              icon={CalendarBlank}
                              iconPosition="left"
                              active={menuOpen}
                              aria-haspopup="menu"
                              aria-expanded={menuOpen}
                              onClick={() => setMenuOpen((open) => !open)}
                            >
                              Reagendar
                            </Button>
                          </div>
                        )}
                      </div>

                      {current.isRecurring && (
                        <p className={styles.note}>
                          {openIds.length > 1
                            ? `Tarefa recorrente: concluir marca as ${openIds.length} vencidas como feitas.`
                            : 'Tarefa recorrente.'}
                          {upcoming && ` A próxima é ${describeUpcoming(upcoming, todayKey, tomorrowKey)}.`}
                        </p>
                      )}
                    </>
                  )}
                </SwipeCard>
              )}
            </AnimatePresence>
          </div>
        </main>

        {canChangeDate && (
          <Dropdown
            isOpen={menuOpen}
            onClose={() => setMenuOpen(false)}
            anchorRef={rescheduleRef}
            width={220}
            align="center"
            position="auto"
            gap={8}
            zIndex={1100}
          >
            <div role="menu" aria-label="Reagendar para" ref={focusFirstMenuItem} onKeyDown={handleMenuKeyDown}>
              <ListItem
                label="Hoje"
                icon={Flag}
                onClick={() => reschedule(todayKey, 'today', 'button')}
                buttonProps={{ role: 'menuitem' }}
              />
              <ListItem
                label="Amanhã"
                icon={SunHorizon}
                onClick={() => reschedule(tomorrowKey, 'tomorrow', 'button')}
                buttonProps={{ role: 'menuitem' }}
              />
              <ListItem
                label="Escolher data"
                icon={CalendarBlank}
                onClick={() => {
                  setMenuOpen(false);
                  setView('date');
                  // The Reagendar button leaves with the menu
                  rootRef.current?.focus({ preventScroll: true });
                }}
                buttonProps={{ role: 'menuitem' }}
              />
            </div>
          </Dropdown>
        )}
      </div>
    </MotionConfig>
  );
}

// ── Swipe ────────────────────────────────────────────────────────────────────

function SwipeCard({
  motionState,
  draggable,
  onSwipe,
  children,
}: {
  motionState: CardMotion;
  draggable: boolean;
  /** False when the swipe was refused: the task springs back */
  onSwipe: (side: 'left' | 'right') => boolean;
  children: ReactNode;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-6, 0, 6]);
  const completeHint = useTransform(x, [24, SWIPE_DISTANCE], [0, 1]);
  const skipHint = useTransform(x, [-SWIPE_DISTANCE, -24], [1, 0]);
  // A drag that starts on a button ends with a click on it:
  // once the pointer has moved, that click is not an action.
  const pressRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const handleDragEnd = (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    const { offset, velocity } = info;
    let swiped = false;
    if (offset.x > 0 && (offset.x > SWIPE_DISTANCE || velocity.x > SWIPE_VELOCITY)) swiped = onSwipe('right');
    else if (offset.x < 0 && (offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY)) swiped = onSwipe('left');
    if (!swiped) animate(x, 0, { type: 'spring', stiffness: 500, damping: 36 });
  };

  return (
    <motion.div
      className={`${styles.card} ${draggable ? styles.cardDraggable : ''}`}
      custom={motionState}
      variants={CARD_VARIANTS}
      initial="enter"
      animate="center"
      exit="exit"
      style={{ x, rotate }}
      drag={draggable ? 'x' : false}
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      onPointerDownCapture={(event) => {
        pressRef.current = { x: event.clientX, y: event.clientY, moved: false };
      }}
      onPointerMoveCapture={(event) => {
        const press = pressRef.current;
        if (press && !press.moved && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 3) {
          press.moved = true;
        }
      }}
      onClickCapture={(event) => {
        if (!pressRef.current?.moved) return;
        event.preventDefault();
        event.stopPropagation();
        pressRef.current = null;
      }}
    >
      <motion.span className={`${styles.swipeHint} ${styles.swipeHintComplete}`} style={{ opacity: completeHint }} aria-hidden="true">
        <Check size={16} weight="bold" />
        Concluir
      </motion.span>
      <motion.span className={`${styles.swipeHint} ${styles.swipeHintSkip}`} style={{ opacity: skipHint }} aria-hidden="true">
        Ignorar
      </motion.span>
      {children}
    </motion.div>
  );
}
