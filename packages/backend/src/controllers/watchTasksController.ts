import { Request, Response } from 'express';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { isDateKey } from '../services/watchVoiceTaskService';
import {
  isWatchTask,
  shiftDateKey,
  WATCH_TASK_COLUMNS,
  WatchTaskRow,
} from '../services/watchTasks';

/**
 * GET /api/tasks/watch?today=YYYY-MM-DD — the Apple Watch list: overdue open
 * tasks and today's, with only the fields the watch shows. `today` is the
 * watch's local date. GET /api/tasks returns every task ever made with every
 * column, which is slow over the watch's link (often Bluetooth through the
 * iPhone).
 *
 * The SQL keeps a day of margin on each side (a TIMESTAMP's day can shift when
 * serialized); the exact rule is `isWatchTask`, the watch's own.
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
    let rows: WatchTaskRow[];
    if (isPostgreSQL()) {
      const result = await getPool().query(
        `SELECT ${WATCH_TASK_COLUMNS} FROM tasks
         WHERE user_id = $1 AND due_date IS NOT NULL AND due_date < $2
           AND (completed = false OR due_date >= $3)`,
        [userId, until, from],
      );
      rows = result.rows;
    } else {
      rows = await getDatabase().all(
        `SELECT ${WATCH_TASK_COLUMNS} FROM tasks
         WHERE user_id = ? AND due_date IS NOT NULL AND due_date < ?
           AND (completed = 0 OR due_date >= ?)`,
        [userId, until, from],
      );
    }
    res.json(rows.filter((row) => isWatchTask(row, today)));
  } catch (error) {
    console.error('Error fetching watch tasks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
