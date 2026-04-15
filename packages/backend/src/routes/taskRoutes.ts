import { Router } from 'express';
import {
  createTask,
  getTasks,
  updateTask,
  deleteTask,
  toggleTaskCompletion,
} from '../controllers/taskController';
import { authenticateToken } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/requireSubscription';
import subTaskRouter from './subTaskRoutes';

const router = Router();

// Task routes (all require authentication + active subscription)
router.post('/', authenticateToken, requireActiveSubscription, createTask);
router.get('/', authenticateToken, requireActiveSubscription, getTasks);
router.put('/:id', authenticateToken, requireActiveSubscription, updateTask);
router.delete('/:id', authenticateToken, requireActiveSubscription, deleteTask);
router.patch('/:id/toggle', authenticateToken, requireActiveSubscription, toggleTaskCompletion);

// Sub-task routes nested under tasks
router.use('/:taskId/subtasks', subTaskRouter);

export default router;
