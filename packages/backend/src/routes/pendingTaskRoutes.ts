import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  confirmPendingTask,
  deletePendingTask,
  getPendingTasks,
  rejectPendingTask,
  updatePendingTask,
} from '../controllers/pendingTaskController';

const router = Router();

router.get('/', authenticateToken, getPendingTasks);
router.post('/:id/confirm', authenticateToken, confirmPendingTask);
router.post('/:id/reject', authenticateToken, rejectPendingTask);
router.put('/:id', authenticateToken, updatePendingTask);
router.delete('/:id', authenticateToken, deletePendingTask);

export default router;
