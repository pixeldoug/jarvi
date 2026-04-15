import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/requireSubscription';
import { createNote, getNotes, updateNote, deleteNote } from '../controllers/noteController';

const router = Router();

// Todas as rotas de notas requerem autenticação e assinatura ativa
router.use(authenticateToken);
router.use(requireActiveSubscription);

// Rotas CRUD para notas
router.post('/', createNote);
router.get('/', getNotes);
router.put('/:id', updateNote);
router.delete('/:id', deleteNote);

export default router;
