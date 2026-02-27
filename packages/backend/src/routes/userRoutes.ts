import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken } from '../middleware/auth';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { sendEmailChangeConfirmation } from '../services/emailService';
import { sendTextMessage } from '../services/whatsappService';
import { validatePasswordStrength } from '../utils/passwordValidator';

// Helper to generate secure token
const generateSecureToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

const generateWhatsappLinkCode = (): string =>
  Math.floor(100000 + Math.random() * 900000).toString();

const normalizeWhatsappPhone = (input: string): string => {
  const digits = input.replace(/\D/g, '');
  return digits ? `+${digits}` : '';
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
const MAX_MEMORY_TEXT_LENGTH = 4000;

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
        if (user.auth_provider === 'google' || user.password === 'google-auth') {
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
      if (user.auth_provider === 'google' || user.password === 'google-auth') {
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

    // Validate password strength
    const passwordValidation = validatePasswordStrength(newPassword, [], 2);
    if (!passwordValidation.isValid) {
      res.status(400).json({ 
        error: passwordValidation.message,
        feedback: passwordValidation.feedback,
      });
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
        if (user.auth_provider === 'google' || user.password === 'google-auth') {
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
      if (user.auth_provider === 'google' || user.password === 'google-auth') {
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

/**
 * POST /api/users/whatsapp-link/request
 * Generates verification code and sends it via WhatsApp.
 */
router.post('/whatsapp-link/request', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }
    const phone = typeof req.body?.phone === 'string' ? req.body.phone : '';
    const normalizedPhone = normalizeWhatsappPhone(phone);

    if (!normalizedPhone || normalizedPhone.length < 12) {
      res.status(400).json({ error: 'Número de WhatsApp inválido. Use formato com DDI e DDD.' });
      return;
    }

    const linkCode = generateWhatsappLinkCode();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    try {
      if (isPostgreSQL()) {
        const pool = getPool();
        await pool.query(
          `UPDATE users
           SET whatsapp_phone = $1, whatsapp_verified = $2, whatsapp_link_code = $3,
               whatsapp_link_code_expires_at = $4, updated_at = $5
           WHERE id = $6`,
          [normalizedPhone, false, linkCode, expiresAt, now, userId]
        );
      } else {
        const db = getDatabase();
        await db.run(
          `UPDATE users
           SET whatsapp_phone = ?, whatsapp_verified = ?, whatsapp_link_code = ?,
               whatsapp_link_code_expires_at = ?, updated_at = ?
           WHERE id = ?`,
          [normalizedPhone, 0, linkCode, expiresAt, now, userId]
        );
      }
    } catch (error: any) {
      const errorMessage = String(error?.message || '');
      const isUniqueViolation =
        error?.code === '23505' || errorMessage.includes('UNIQUE constraint failed');

      if (isUniqueViolation) {
        res.status(409).json({ error: 'Este número já está vinculado a outra conta.' });
        return;
      }

      throw error;
    }

    await sendTextMessage(
      normalizedPhone,
      `Seu código Jarvi é: ${linkCode}. Ele expira em 10 minutos.`
    );

    res.json({
      success: true,
      message: 'Código enviado via WhatsApp.',
      expiresAt,
      phone: normalizedPhone,
    });
  } catch (error) {
    console.error('Error requesting WhatsApp link:', error);
    res.status(500).json({ error: 'Erro ao solicitar vinculação do WhatsApp' });
  }
});

/**
 * POST /api/users/whatsapp-link/verify
 * Verifies code and marks whatsapp as linked.
 */
router.post('/whatsapp-link/verify', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }
    const providedCode = String(req.body?.code || '').replace(/\D/g, '').slice(0, 6);
    if (providedCode.length !== 6) {
      res.status(400).json({ error: 'Código inválido' });
      return;
    }

    let user: any;
    const now = new Date().toISOString();

    if (isPostgreSQL()) {
      const pool = getPool();
      const result = await pool.query(
        `SELECT id, whatsapp_phone, whatsapp_link_code, whatsapp_link_code_expires_at
         FROM users
         WHERE id = $1`,
        [userId]
      );
      user = result.rows[0];
    } else {
      const db = getDatabase();
      user = await db.get(
        `SELECT id, whatsapp_phone, whatsapp_link_code, whatsapp_link_code_expires_at
         FROM users
         WHERE id = ?`,
        [userId]
      );
    }

    if (!user) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }

    if (!user.whatsapp_phone || !user.whatsapp_link_code || !user.whatsapp_link_code_expires_at) {
      res.status(400).json({ error: 'Nenhuma solicitação de vinculação pendente' });
      return;
    }

    const expiresAt = new Date(user.whatsapp_link_code_expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
      res.status(400).json({ error: 'Código expirado. Solicite um novo código.' });
      return;
    }

    if (providedCode !== String(user.whatsapp_link_code)) {
      res.status(400).json({ error: 'Código inválido' });
      return;
    }

    if (isPostgreSQL()) {
      const pool = getPool();
      await pool.query(
        `UPDATE users
         SET whatsapp_verified = $1, whatsapp_link_code = NULL, whatsapp_link_code_expires_at = NULL, updated_at = $2
         WHERE id = $3`,
        [true, now, userId]
      );
    } else {
      const db = getDatabase();
      await db.run(
        `UPDATE users
         SET whatsapp_verified = ?, whatsapp_link_code = NULL, whatsapp_link_code_expires_at = NULL, updated_at = ?
         WHERE id = ?`,
        [1, now, userId]
      );
    }

    res.json({
      success: true,
      message: 'WhatsApp vinculado com sucesso.',
      phone: user.whatsapp_phone,
    });
  } catch (error) {
    console.error('Error verifying WhatsApp link:', error);
    res.status(500).json({ error: 'Erro ao verificar código de vinculação' });
  }
});

/**
 * DELETE /api/users/whatsapp-link
 * Unlinks WhatsApp number from account.
 */
router.delete('/whatsapp-link', authenticateToken, async (req: Request, res: Response) => {
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
        `UPDATE users
         SET whatsapp_phone = NULL, whatsapp_verified = FALSE, whatsapp_link_code = NULL,
             whatsapp_link_code_expires_at = NULL, updated_at = $1
         WHERE id = $2`,
        [now, userId]
      );
    } else {
      const db = getDatabase();
      await db.run(
        `UPDATE users
         SET whatsapp_phone = NULL, whatsapp_verified = 0, whatsapp_link_code = NULL,
             whatsapp_link_code_expires_at = NULL, updated_at = ?
         WHERE id = ?`,
        [now, userId]
      );
    }

    res.json({ success: true, message: 'Vinculação do WhatsApp removida.' });
  } catch (error) {
    console.error('Error unlinking WhatsApp:', error);
    res.status(500).json({ error: 'Erro ao remover vinculação do WhatsApp' });
  }
});

/**
 * GET /api/users/memory-profile
 * Get authenticated user's AI memory profile
 */
router.get('/memory-profile', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    if (isPostgreSQL()) {
      const pool = getPool();
      const result = await pool.query(
        `SELECT memory_text, source, source_ref, consent_ai_memory, updated_at
         FROM user_memory_profiles
         WHERE user_id = $1`,
        [userId]
      );
      const profile = result.rows[0];

      res.json({
        memoryText: profile?.memory_text || '',
        source: profile?.source || 'manual',
        sourceRef: profile?.source_ref || null,
        consentAiMemory: profile ? profile.consent_ai_memory === true : false,
        updatedAt: profile?.updated_at || null,
      });
      return;
    }

    const db = getDatabase();
    const profile = (await db.get(
      `SELECT memory_text, source, source_ref, consent_ai_memory, updated_at
       FROM user_memory_profiles
       WHERE user_id = ?`,
      [userId]
    )) as
      | {
          memory_text?: string | null;
          source?: string | null;
          source_ref?: string | null;
          consent_ai_memory?: boolean | number | null;
          updated_at?: string | null;
        }
      | undefined;

    res.json({
      memoryText: profile?.memory_text || '',
      source: profile?.source || 'manual',
      sourceRef: profile?.source_ref || null,
      consentAiMemory: profile ? Boolean(profile.consent_ai_memory) : false,
      updatedAt: profile?.updated_at || null,
    });
  } catch (error) {
    console.error('Error fetching memory profile:', error);
    res.status(500).json({ error: 'Erro ao carregar memória compartilhada' });
  }
});

/**
 * PUT /api/users/memory-profile
 * Update authenticated user's AI memory profile
 */
router.put('/memory-profile', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const memoryTextRaw = req.body?.memoryText;
    if (typeof memoryTextRaw !== 'string') {
      res.status(400).json({ error: 'memoryText deve ser um texto' });
      return;
    }

    const memoryText = memoryTextRaw.trim();
    if (memoryText.length > MAX_MEMORY_TEXT_LENGTH) {
      res
        .status(400)
        .json({ error: `A memória deve ter no máximo ${MAX_MEMORY_TEXT_LENGTH} caracteres` });
      return;
    }

    const consentAiMemoryRaw = req.body?.consentAiMemory;
    const consentAiMemory = typeof consentAiMemoryRaw === 'boolean' ? consentAiMemoryRaw : true;
    const now = new Date().toISOString();

    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const existingResult = await client.query(
          'SELECT id FROM user_memory_profiles WHERE user_id = $1',
          [userId]
        );

        if (existingResult.rows.length > 0) {
          await client.query(
            `UPDATE user_memory_profiles
             SET memory_text = $1,
                 source = $2,
                 source_ref = NULL,
                 consent_ai_memory = $3,
                 updated_at = $4
             WHERE user_id = $5`,
            [memoryText, 'manual', consentAiMemory, now, userId]
          );
        } else {
          await client.query(
            `INSERT INTO user_memory_profiles (
              id, user_id, memory_text, source, source_ref, consent_ai_memory, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, NULL, $5, $6, $7)`,
            [uuidv4(), userId, memoryText, 'manual', consentAiMemory, now, now]
          );
        }
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      const existingProfile = await db.get('SELECT id FROM user_memory_profiles WHERE user_id = ?', [userId]);

      if (existingProfile) {
        await db.run(
          `UPDATE user_memory_profiles
           SET memory_text = ?, source = ?, source_ref = NULL, consent_ai_memory = ?, updated_at = ?
           WHERE user_id = ?`,
          [memoryText, 'manual', consentAiMemory, now, userId]
        );
      } else {
        await db.run(
          `INSERT INTO user_memory_profiles (
            id, user_id, memory_text, source, source_ref, consent_ai_memory, created_at, updated_at
          ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
          [uuidv4(), userId, memoryText, 'manual', consentAiMemory, now, now]
        );
      }
    }

    res.json({
      success: true,
      message: 'Memória atualizada com sucesso',
      profile: {
        memoryText,
        source: 'manual',
        sourceRef: null,
        consentAiMemory,
        updatedAt: now,
      },
    });
  } catch (error) {
    console.error('Error updating memory profile:', error);
    res.status(500).json({ error: 'Erro ao atualizar memória compartilhada' });
  }
});

export default router;
