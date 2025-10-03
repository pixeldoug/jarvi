import { Router } from 'express';
import { 
  shareNote, 
  getSharedNotes, 
  getNoteShares, 
  unshareNote, 
  updateSharePermission,
  searchUsers 
} from '../controllers/noteShareController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Aplicar middleware de autenticação em todas as rotas
router.use(authenticateToken);

// Compartilhar uma nota
router.post('/notes/:noteId/share', shareNote);

// Buscar usuários para compartilhamento
router.get('/users/search', searchUsers);

// Obter notas compartilhadas com o usuário atual
router.get('/notes/shared', getSharedNotes);

// Obter compartilhamentos de uma nota específica
router.get('/notes/:noteId/shares', getNoteShares);

// Atualizar permissão de compartilhamento
router.put('/notes/:noteId/shares/:shareId', updateSharePermission);

// Remover compartilhamento
router.delete('/notes/:noteId/shares/:shareId', unshareNote);

export default router;
