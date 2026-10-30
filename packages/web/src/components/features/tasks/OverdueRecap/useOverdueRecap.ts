/**
 * useOverdueRecap — the Recap das tarefas vencidas on the Tasks page.
 *
 * `count` feeds the header button and `open(trigger)` snapshots the overdue
 * items, so the Recap keeps its order while tasks refetch. On its own it opens
 * at most once a day per device, and only at the moment the page first has
 * its tasks: the user has it on (Settings › Tarefas), something is overdue and
 * nothing else is in the way (`canAutoOpen`, another dialog). If that moment
 * passes, it waits for the next visit instead of popping up mid-task.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIsFetching } from '@tanstack/react-query';
import { useAuth } from '../../../../contexts/AuthContext';
import { useTasks } from '../../../../contexts/TaskContext';
import { captureProductEvent } from '../../../../lib/productAnalytics';
import {
  buildOverdueRecapItems,
  isOverdueRecapPreviewRequested,
  markRecapShownOn,
  readRecapShownOn,
  toLocalDateKey,
  type OverdueRecapItem,
} from '../../../../lib/overdueRecap';

export type OverdueRecapTrigger = 'auto' | 'button';

export interface OverdueRecapSession {
  /** New per opening, so the dialog never carries state over from an earlier one */
  id: number;
  items: OverdueRecapItem[];
  trigger: OverdueRecapTrigger;
}

/** Lets the page settle before the dialog comes up */
const AUTO_OPEN_DELAY_MS = 700;

/** Users it already opened for on its own in this page load (the Tasks page remounts on every visit) */
const autoOpenedThisLoad = new Set<string>();

let nextSessionId = 1;

export function useOverdueRecap({ canAutoOpen }: { canAutoOpen: boolean }) {
  const { user } = useAuth();
  const { tasks, isLoading } = useTasks();
  const isFetching = useIsFetching({ queryKey: ['tasks'] }) > 0;
  const userId = user?.id;
  const enabled = user?.overdueRecapEnabled !== false;

  const todayKey = toLocalDateKey(new Date());
  const items = useMemo(() => buildOverdueRecapItems(tasks, todayKey), [tasks, todayKey]);
  const [session, setSession] = useState<OverdueRecapSession | null>(null);

  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const canAutoOpenRef = useRef(canAutoOpen);
  canAutoOpenRef.current = canAutoOpen;
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const open = useCallback((trigger: OverdueRecapTrigger): boolean => {
    // Already open (e.g. Enter/Space on the header button that kept focus): keep the current queue
    if (sessionRef.current) return false;
    const snapshot = buildOverdueRecapItems(tasksRef.current, toLocalDateKey(new Date()));
    if (snapshot.length === 0) return false;
    // The Dialog doesn't take focus; the button that opened it must not keep it
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const next = { id: nextSessionId++, items: snapshot, trigger };
    sessionRef.current = next;
    setSession(next);
    captureProductEvent('overdue_recap_opened', {
      trigger,
      items: snapshot.length,
      tasks: snapshot.reduce((sum, item) => sum + item.taskIds.length, 0),
    });
    return true;
  }, []);

  const close = useCallback(() => {
    sessionRef.current = null;
    setSession(null);
  }, []);

  // Decided once per visit. The ref is set when the decision is final, not
  // before the timer, so StrictMode's effect re-run still opens it.
  const autoOpenDecidedRef = useRef(false);
  const isReady = !!userId && !isLoading && !isFetching;
  useEffect(() => {
    if (!isReady || !userId || autoOpenDecidedRef.current) return;
    const preview = isOverdueRecapPreviewRequested();
    if (
      !enabled ||
      autoOpenedThisLoad.has(userId) ||
      (!preview && readRecapShownOn(userId) === todayKey) ||
      items.length === 0
    ) {
      autoOpenDecidedRef.current = true;
      return;
    }

    const timer = window.setTimeout(() => {
      autoOpenDecidedRef.current = true;
      // The user is already doing something, or another dialog (or the trial gate) is up
      if (!canAutoOpenRef.current) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      // Typing (e.g. in the ControlBar): opening would take the next keys as card actions
      if (document.activeElement?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (!open('auto')) return;
      autoOpenedThisLoad.add(userId);
      markRecapShownOn(userId, toLocalDateKey(new Date()));
    }, AUTO_OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
    // Only the first moment the tasks are in counts; later changes don't reopen the question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  return {
    enabled,
    /** Cards the Recap would show now (0 when it is off) */
    count: enabled ? items.length : 0,
    session,
    open,
    close,
  };
}
