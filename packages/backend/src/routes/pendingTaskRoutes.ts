import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/requireSubscription';
import {
  confirmPendingTask,
  deletePendingTask,
  getPendingTasks,
  rejectPendingTask,
  updatePendingTask,
} from '../controllers/pendingTaskController';

const router = Router();

router.use(authenticateToken, requireActiveSubscription);

router.get('/', getPendingTasks);
router.post('/:id/confirm', confirmPendingTask);
router.post('/:id/reject', rejectPendingTask);
router.put('/:id', updatePendingTask);
router.delete('/:id', deletePendingTask);

export default router;
