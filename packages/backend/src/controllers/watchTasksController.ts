import { Request, Response } from 'express';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { isDateKey } from '../services/watchVoiceTaskService';
import {
  shiftDateKey,
  WATCH_TASK_COLUMNS,
  WATCH_UPCOMING_LIMIT,
  watchTaskList,
  WatchTaskRow,
} from '../services/watchTasks';

/**
 * GET /api/tasks/watch?today=YYYY-MM-DD — the Apple Watch list: overdue open
 * tasks, today's, and the soonest upcoming open ones (its three chips), with
 * only the fields the watch shows. `today` is the
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
  // Upcoming: open from today on (margin), soonest first, a few extra for
  // the margin rows the exact rule drops.
  const upcomingLimit = WATCH_UPCOMING_LIMIT + 10;
  try {
    let current: WatchTaskRow[];
    let upcoming: WatchTaskRow[];
    if (isPostgreSQL()) {
      const pool = getPool();
      [current, upcoming] = await Promise.all([
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
            [userId, today, upcomingLimit],
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
      upcoming = await db.all(
        `SELECT ${WATCH_TASK_COLUMNS} FROM tasks
         WHERE user_id = ? AND completed = 0 AND due_date >= ?
         ORDER BY due_date ASC LIMIT ?`,
        [userId, today, upcomingLimit],
      );
    }
    res.json(watchTaskList(current, upcoming, today));
  } catch (error) {
    console.error('Error fetching watch tasks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
