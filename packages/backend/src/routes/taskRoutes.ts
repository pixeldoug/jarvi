import { Router } from 'express';
import {
  createTask,
  getTasks,
  updateTask,
  deleteTask,
  toggleTaskCompletion,
} from '../controllers/taskController';
import { authenticateToken } from '../middleware/auth';
import subTaskRouter from './subTaskRoutes';

const router = Router();

// Task routes (all require authentication)
router.post('/', authenticateToken, createTask);
router.get('/', authenticateToken, getTasks);
router.put('/:id', authenticateToken, updateTask);
router.delete('/:id', authenticateToken, deleteTask);
router.patch('/:id/toggle', authenticateToken, toggleTaskCompletion);

// Sub-task routes nested under tasks
router.use('/:taskId/subtasks', subTaskRouter);

export default router;
