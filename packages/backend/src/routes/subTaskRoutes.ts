import { Router } from 'express';
import {
  getSubTasks,
  createSubTask,
  updateSubTask,
  toggleSubTask,
  deleteSubTask,
} from '../controllers/subTaskController';
import { authenticateToken } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/requireSubscription';

const router = Router({ mergeParams: true });

router.get('/', authenticateToken, requireActiveSubscription, getSubTasks);
router.post('/', authenticateToken, requireActiveSubscription, createSubTask);
router.put('/:id', authenticateToken, requireActiveSubscription, updateSubTask);
router.patch('/:id/toggle', authenticateToken, requireActiveSubscription, toggleSubTask);
router.delete('/:id', authenticateToken, requireActiveSubscription, deleteSubTask);

export default router;
