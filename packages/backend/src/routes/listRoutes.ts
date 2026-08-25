import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/requireSubscription';
import { createList, deleteList, getLists, updateList } from '../controllers/listController';

const router = Router();

// List routes (all require authentication + active subscription)
router.get('/', authenticateToken, requireActiveSubscription, getLists);
router.post('/', authenticateToken, requireActiveSubscription, createList);
router.put('/:id', authenticateToken, requireActiveSubscription, updateList);
router.delete('/:id', authenticateToken, requireActiveSubscription, deleteList);

export default router;

