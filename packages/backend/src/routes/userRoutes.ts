import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { getDatabase, getPool, isPostgreSQL } from '../database';

const router = Router();

// Constants for validation
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Helper to validate base64 image
const validateBase64Image = (base64String: string): { valid: boolean; error?: string } => {
  // Check if it's a valid data URL
  const matches = base64String.match(/^data:(image\/\w+);base64,(.+)$/);
  
  if (!matches) {
    return { valid: false, error: 'Formato de imagem inválido' };
  }

  const mimeType = matches[1];
  const base64Data = matches[2];

  // Check mime type
  if (!ALLOWED_TYPES.includes(mimeType)) {
    return { valid: false, error: 'Tipo de arquivo não permitido. Use JPG, PNG ou WebP.' };
  }

  // Check file size (base64 is ~33% larger than binary)
  const estimatedSize = (base64Data.length * 3) / 4;
  if (estimatedSize > MAX_FILE_SIZE) {
    return { valid: false, error: 'Imagem muito grande. Máximo 4MB.' };
  }

  return { valid: true };
};

/**
 * POST /api/users/avatar
 * Upload user avatar (base64)
 */
router.post('/avatar', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const { avatar } = req.body;

    if (!avatar) {
      res.status(400).json({ error: 'Avatar é obrigatório' });
      return;
    }

    // Validate the image
    const validation = validateBase64Image(avatar);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const now = new Date().toISOString();

    if (isPostgreSQL()) {
      const pool = getPool();
      await pool.query(
        'UPDATE users SET avatar = $1, updated_at = $2 WHERE id = $3',
        [avatar, now, userId]
      );
    } else {
      const db = getDatabase();
      await db.run(
        'UPDATE users SET avatar = ?, updated_at = ? WHERE id = ?',
        [avatar, now, userId]
      );
    }

    res.json({ 
      success: true, 
      message: 'Avatar atualizado com sucesso',
      avatar 
    });
  } catch (error) {
    console.error('Error uploading avatar:', error);
    res.status(500).json({ error: 'Erro ao atualizar avatar' });
  }
});

/**
 * DELETE /api/users/avatar
 * Remove user avatar
 */
router.delete('/avatar', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const now = new Date().toISOString();

    if (isPostgreSQL()) {
      const pool = getPool();
      await pool.query(
        'UPDATE users SET avatar = NULL, updated_at = $1 WHERE id = $2',
        [now, userId]
      );
    } else {
      const db = getDatabase();
      await db.run(
        'UPDATE users SET avatar = NULL, updated_at = ? WHERE id = ?',
        [now, userId]
      );
    }

    res.json({ 
      success: true, 
      message: 'Avatar removido com sucesso' 
    });
  } catch (error) {
    console.error('Error removing avatar:', error);
    res.status(500).json({ error: 'Erro ao remover avatar' });
  }
});

/**
 * PUT /api/users/profile
 * Update user profile (name)
 */
router.put('/profile', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      res.status(400).json({ error: 'Nome é obrigatório' });
      return;
    }

    const now = new Date().toISOString();

    if (isPostgreSQL()) {
      const pool = getPool();
      await pool.query(
        'UPDATE users SET name = $1, updated_at = $2 WHERE id = $3',
        [name.trim(), now, userId]
      );
    } else {
      const db = getDatabase();
      await db.run(
        'UPDATE users SET name = ?, updated_at = ? WHERE id = ?',
        [name.trim(), now, userId]
      );
    }

    res.json({ 
      success: true, 
      message: 'Perfil atualizado com sucesso',
      name: name.trim()
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

export default router;
