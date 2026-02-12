import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { createList, deleteList, getLists, updateList } from '../controllers/listController';

const router = Router();

// List routes (all require authentication)
router.get('/', authenticateToken, getLists);
router.post('/', authenticateToken, createList);
router.put('/:id', authenticateToken, updateList);
router.delete('/:id', authenticateToken, deleteList);

export default router;

