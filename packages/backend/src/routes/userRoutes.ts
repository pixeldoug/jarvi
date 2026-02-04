import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { authenticateToken } from '../middleware/auth';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { sendEmailChangeConfirmation } from '../services/emailService';

// Helper to generate secure token
const generateSecureToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

// Helper to get token expiration
const getTokenExpiration = (hours: number): string => {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date.toISOString();
};

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

/**
 * PUT /api/users/email
 * Update user email (requires current password and re-verification)
 */
router.put('/email', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const { newEmail, currentPassword } = req.body;

    if (!newEmail || !currentPassword) {
      res.status(400).json({ error: 'Novo email e senha atual são obrigatórios' });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      res.status(400).json({ error: 'Formato de email inválido' });
      return;
    }

    const now = new Date().toISOString();
    const verificationToken = generateSecureToken();
    const tokenExpires = getTokenExpiration(24);
    let user;

    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        // Get current user
        const userResult = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
        user = userResult.rows[0];

        if (!user) {
          res.status(404).json({ error: 'Usuário não encontrado' });
          return;
        }

        // Check if user is Google-only
        if (user.password === 'google-auth') {
          res.status(400).json({ error: 'Usuários Google não podem alterar o email por aqui. Use sua conta Google.' });
          return;
        }

        // Verify current password
        const isValidPassword = await bcrypt.compare(currentPassword, user.password);
        if (!isValidPassword) {
          res.status(401).json({ error: 'Senha atual incorreta' });
          return;
        }

        // Check if new email is already in use
        const existingResult = await client.query('SELECT id FROM users WHERE email = $1 AND id != $2', [newEmail, userId]);
        if (existingResult.rows.length > 0) {
          res.status(400).json({ error: 'Este email já está em uso' });
          return;
        }

        // Store new email pending verification
        // We'll use a temporary approach: store in verification fields
        await client.query(
          `UPDATE users 
           SET email_verification_token = $1, email_verification_expires = $2, updated_at = $3
           WHERE id = $4`,
          [`${verificationToken}:${newEmail}`, tokenExpires, now, userId]
        );
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      
      // Get current user
      user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);

      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      // Check if user is Google-only
      if (user.password === 'google-auth') {
        res.status(400).json({ error: 'Usuários Google não podem alterar o email por aqui. Use sua conta Google.' });
        return;
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        res.status(401).json({ error: 'Senha atual incorreta' });
        return;
      }

      // Check if new email is already in use
      const existingUser = await db.get('SELECT id FROM users WHERE email = ? AND id != ?', [newEmail, userId]);
      if (existingUser) {
        res.status(400).json({ error: 'Este email já está em uso' });
        return;
      }

      // Store new email pending verification
      await db.run(
        `UPDATE users 
         SET email_verification_token = ?, email_verification_expires = ?, updated_at = ?
         WHERE id = ?`,
        [`${verificationToken}:${newEmail}`, tokenExpires, now, userId]
      );
    }

    // Send verification email to new address
    try {
      await sendEmailChangeConfirmation(newEmail, user.name, verificationToken);
    } catch (emailError) {
      console.error('Failed to send email change confirmation:', emailError);
      res.status(500).json({ error: 'Erro ao enviar email de confirmação' });
      return;
    }

    res.json({ 
      success: true, 
      message: 'Email de confirmação enviado para o novo endereço. Verifique sua caixa de entrada.' 
    });
  } catch (error) {
    console.error('Error updating email:', error);
    res.status(500).json({ error: 'Erro ao atualizar email' });
  }
});

/**
 * PUT /api/users/password
 * Update user password (requires current password)
 */
router.put('/password', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: 'Nova senha deve ter pelo menos 6 caracteres' });
      return;
    }

    const now = new Date().toISOString();
    let user;

    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        // Get current user
        const userResult = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
        user = userResult.rows[0];

        if (!user) {
          res.status(404).json({ error: 'Usuário não encontrado' });
          return;
        }

        // Check if user is Google-only
        if (user.password === 'google-auth') {
          res.status(400).json({ error: 'Usuários Google não podem alterar a senha. Use sua conta Google para fazer login.' });
          return;
        }

        // Verify current password
        const isValidPassword = await bcrypt.compare(currentPassword, user.password);
        if (!isValidPassword) {
          res.status(401).json({ error: 'Senha atual incorreta' });
          return;
        }

        // Hash and update new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await client.query(
          'UPDATE users SET password = $1, updated_at = $2 WHERE id = $3',
          [hashedPassword, now, userId]
        );
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      
      // Get current user
      user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);

      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      // Check if user is Google-only
      if (user.password === 'google-auth') {
        res.status(400).json({ error: 'Usuários Google não podem alterar a senha. Use sua conta Google para fazer login.' });
        return;
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        res.status(401).json({ error: 'Senha atual incorreta' });
        return;
      }

      // Hash and update new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await db.run(
        'UPDATE users SET password = ?, updated_at = ? WHERE id = ?',
        [hashedPassword, now, userId]
      );
    }

    res.json({ 
      success: true, 
      message: 'Senha atualizada com sucesso' 
    });
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({ error: 'Erro ao atualizar senha' });
  }
});

export default router;
