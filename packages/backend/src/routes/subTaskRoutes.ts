import { Router } from 'express';
import {
  getSubTasks,
  createSubTask,
  updateSubTask,
  toggleSubTask,
  deleteSubTask,
} from '../controllers/subTaskController';
import { authenticateToken } from '../middleware/auth';

const router = Router({ mergeParams: true });

router.get('/', authenticateToken, getSubTasks);
router.post('/', authenticateToken, createSubTask);
router.put('/:id', authenticateToken, updateSubTask);
router.patch('/:id/toggle', authenticateToken, toggleSubTask);
router.delete('/:id', authenticateToken, deleteSubTask);

export default router;
