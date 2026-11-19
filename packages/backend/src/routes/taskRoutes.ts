import { Router } from 'express';
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
import { authenticateToken } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/requireSubscription';
import subTaskRouter from './subTaskRoutes';
import reminderRouter from './reminderRoutes';

const router = Router();

// Task routes (all require authentication + active subscription)
router.post('/', authenticateToken, requireActiveSubscription, createTask);
router.get('/', authenticateToken, requireActiveSubscription, getTasks);
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
