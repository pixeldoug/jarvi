import { Router } from 'express';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
} from '../controllers/categoryController';
import { authenticateToken } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/requireSubscription';

const router = Router();

// Category routes (all require authentication + active subscription)
router.get('/', authenticateToken, requireActiveSubscription, getCategories);
router.post('/', authenticateToken, requireActiveSubscription, createCategory);
router.patch('/reorder', authenticateToken, requireActiveSubscription, reorderCategories);
router.put('/:id', authenticateToken, requireActiveSubscription, updateCategory);
router.delete('/:id', authenticateToken, requireActiveSubscription, deleteCategory);

export default router;
