import { Router } from 'express';
import {
  createTask,
  getTasks,
  updateTask,
  deleteTask,
  toggleTaskCompletion,
} from '../controllers/taskController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Task routes (all require authentication)
router.post('/', authenticateToken, createTask);
router.get('/', authenticateToken, getTasks);
router.put('/:id', authenticateToken, updateTask);
router.delete('/:id', authenticateToken, deleteTask);
router.patch('/:id/toggle', authenticateToken, toggleTaskCompletion);

export default router;
