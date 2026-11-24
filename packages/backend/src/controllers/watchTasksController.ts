import { Request, Response } from 'express';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { isDateKey } from '../services/watchVoiceTaskService';
import {
  shiftDateKey,
  WATCH_SOURCE,
  WATCH_SPOKEN_LIMIT,
  WATCH_TASK_COLUMNS,
  WATCH_UPCOMING_LIMIT,
  watchTaskList,
  WatchTaskRow,
} from '../services/watchTasks';

/**
 * GET /api/tasks/watch?today=YYYY-MM-DD — the Apple Watch list: today's
 * tasks, the soonest upcoming open ones, overdue open tasks and the open ones
 * spoken on the watch (its four chips), with only the fields the watch shows. `today` is the
 * watch's local date. GET /api/tasks returns every task ever made with every
 * column, which is slow over the watch's link (often Bluetooth through the
 * iPhone).
 *
 * The SQL keeps a day of margin on each side (a TIMESTAMP's day can shift when
 * serialized); the exact rules are in `watchTaskList`, the watch's own.
 */
export const getWatchTasks = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }
  const today = req.query.today;
  if (!isDateKey(today)) {
    res.status(400).json({ error: 'invalid_today' });
    return;
  }

  const from = shiftDateKey(today, -1);
  const until = shiftDateKey(today, 2);
  try {
    // Everything up to tomorrow (overdue, today, and tomorrow's open tasks)…
    let current: WatchTaskRow[];
    // …and the soonest open tasks after that. Starting after the first query
    // ends, today's tasks never take up the upcoming limit.
    let later: WatchTaskRow[];
    // …and the newest open tasks spoken on the watch, whatever their date.
    let spoken: WatchTaskRow[];
    if (isPostgreSQL()) {
      const pool = getPool();
      [current, later, spoken] = await Promise.all([
        pool
          .query(
            `SELECT ${WATCH_TASK_COLUMNS} FROM tasks
             WHERE user_id = $1 AND due_date IS NOT NULL AND due_date < $2
               AND (completed = false OR due_date >= $3)`,
            [userId, until, from],
          )
          .then((result) => result.rows),
        pool
          .query(
            `SELECT ${WATCH_TASK_COLUMNS} FROM tasks
             WHERE user_id = $1 AND completed = false AND due_date >= $2
             ORDER BY due_date ASC LIMIT $3`,
            [userId, until, WATCH_UPCOMING_LIMIT],
          )
          .then((result) => result.rows),
        pool
          .query(
            `SELECT ${WATCH_TASK_COLUMNS} FROM tasks
             WHERE user_id = $1 AND source = $2 AND completed = false
             ORDER BY created_at DESC LIMIT $3`,
            [userId, WATCH_SOURCE, WATCH_SPOKEN_LIMIT],
          )
          .then((result) => result.rows),
      ]);
    } else {
      const db = getDatabase();
      current = await db.all(
        `SELECT ${WATCH_TASK_COLUMNS} FROM tasks
         WHERE user_id = ? AND due_date IS NOT NULL AND due_date < ?
           AND (completed = 0 OR due_date >= ?)`,
        [userId, until, from],
      );
      later = await db.all(
        `SELECT ${WATCH_TASK_COLUMNS} FROM tasks
         WHERE user_id = ? AND completed = 0 AND due_date >= ?
         ORDER BY due_date ASC LIMIT ?`,
        [userId, until, WATCH_UPCOMING_LIMIT],
      );
      spoken = await db.all(
        `SELECT ${WATCH_TASK_COLUMNS} FROM tasks
         WHERE user_id = ? AND source = ? AND completed = 0
         ORDER BY created_at DESC LIMIT ?`,
        [userId, WATCH_SOURCE, WATCH_SPOKEN_LIMIT],
      );
    }
    res.json(watchTaskList(current, later, today, spoken));
  } catch (error) {
    console.error('Error fetching watch tasks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
