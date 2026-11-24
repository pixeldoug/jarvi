import { Router, Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import {
  createTask,
  getTasks,
  updateTask,
  deleteTask,
  toggleTaskCompletion,
  setTasksCompletion,
  setTasksOrder,
} from '../controllers/taskController';
import {
  getTaskDescriptionVersions,
  restoreTaskDescription,
} from '../controllers/taskDescriptionVersionController';
import { createTaskFromVoice } from '../controllers/watchVoiceController';
import { getWatchTasks } from '../controllers/watchTasksController';
import { authenticateToken } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/requireSubscription';
import subTaskRouter from './subTaskRoutes';
import reminderRouter from './reminderRoutes';

const router = Router();

// Apple Watch voice tasks: one Whisper call and one small completion each.
// Runs after authenticateToken, so `req.user` is set.
const voiceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req: Request) => req.user?.id || (req.ip ? ipKeyGenerator(req.ip) : 'unknown'),
  message: { error: 'rate_limited' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Task routes (all require authentication + active subscription)
router.post('/', authenticateToken, requireActiveSubscription, createTask);
router.post('/voice', authenticateToken, requireActiveSubscription, voiceLimiter, createTaskFromVoice);
router.get('/', authenticateToken, requireActiveSubscription, getTasks);
// Apple Watch list: only overdue + today, only the fields it shows.
router.get('/watch', authenticateToken, requireActiveSubscription, getWatchTasks);
router.patch('/completion', authenticateToken, requireActiveSubscription, setTasksCompletion);
router.patch('/order', authenticateToken, requireActiveSubscription, setTasksOrder);
router.put('/:id', authenticateToken, requireActiveSubscription, updateTask);
router.delete('/:id', authenticateToken, requireActiveSubscription, deleteTask);
router.patch('/:id/toggle', authenticateToken, requireActiveSubscription, toggleTaskCompletion);

// What the description said before each AI change, and going back to it
router.get('/:id/description-versions', authenticateToken, requireActiveSubscription, getTaskDescriptionVersions);
router.post(
  '/:id/description-versions/:versionId/restore',
  authenticateToken,
  requireActiveSubscription,
  restoreTaskDescription,
);

// Sub-task routes nested under tasks
router.use('/:taskId/subtasks', subTaskRouter);

// Reminder routes nested under tasks
router.use('/:taskId/reminders', reminderRouter);

export default router;
