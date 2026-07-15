import { Router } from 'express';
import {
  createReminder,
  deleteReminderHandler,
  getReminders,
  replaceReminders,
} from '../controllers/reminderController';
import { authenticateToken } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/requireSubscription';

const router = Router({ mergeParams: true });

router.get('/', authenticateToken, requireActiveSubscription, getReminders);
router.post('/', authenticateToken, requireActiveSubscription, createReminder);
router.put('/', authenticateToken, requireActiveSubscription, replaceReminders);
router.delete('/:id', authenticateToken, requireActiveSubscription, deleteReminderHandler);

export default router;
