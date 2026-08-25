import { Router } from 'express';
import {
  createReminder,
  deleteReminderHandler,
  getReminders,
  replaceReminders,
} from '../controllers/reminderController';
import { authenticateToken } from '../middleware/auth';

const router = Router({ mergeParams: true });

router.get('/', authenticateToken, getReminders);
router.post('/', authenticateToken, createReminder);
router.put('/', authenticateToken, replaceReminders);
router.delete('/:id', authenticateToken, deleteReminderHandler);

export default router;
