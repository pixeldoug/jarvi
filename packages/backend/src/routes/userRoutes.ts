import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken } from '../middleware/auth';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { sendEmailChangeConfirmation } from '../services/emailService';
import { sendVerificationCode } from '../services/whatsappService';
import { validatePasswordStrength } from '../utils/passwordValidator';
import { cancelSubscriptionForDeletion } from '../services/stripeService';

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
        'UPDATE users SET avatar = $1, avatar_explicitly_removed = FALSE, updated_at = $2 WHERE id = $3',
        [avatar, now, userId]
      );
    } else {
      const db = getDatabase();
      await db.run(
        'UPDATE users SET avatar = ?, avatar_explicitly_removed = 0, updated_at = ? WHERE id = ?',
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
        'UPDATE users SET avatar = NULL, avatar_explicitly_removed = TRUE, updated_at = $1 WHERE id = $2',
        [now, userId]
      );
    } else {
      const db = getDatabase();
      await db.run(
        'UPDATE users SET avatar = NULL, avatar_explicitly_removed = 1, updated_at = ? WHERE id = ?',
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
 * Update user profile (name, preferred_name)
 */
router.put('/profile', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const { name, preferred_name } = req.body;

    if (name !== undefined && name.trim().length === 0) {
      res.status(400).json({ error: 'Nome é obrigatório' });
      return;
    }

    const now = new Date().toISOString();
    const updates: Record<string, string> = { updated_at: now };
    if (name !== undefined) updates.name = name.trim();
    if (preferred_name !== undefined) updates.preferred_name = preferred_name.trim() || null as unknown as string;

    if (isPostgreSQL()) {
      const pool = getPool();
      const setClauses = Object.keys(updates)
        .filter((k) => k !== 'updated_at')
        .map((k, i) => `${k} = $${i + 1}`)
        .concat(`updated_at = $${Object.keys(updates).length}`)
        .join(', ');
      const values = [
        ...Object.entries(updates).filter(([k]) => k !== 'updated_at').map(([, v]) => v),
        now,
        userId,
      ];
      await pool.query(
        `UPDATE users SET ${setClauses} WHERE id = $${values.length}`,
        values,
      );
    } else {
      const db = getDatabase();
      const setClauses = Object.keys(updates)
        .filter((k) => k !== 'updated_at')
        .map((k) => `${k} = ?`)
        .concat('updated_at = ?')
        .join(', ');
      const values = [
        ...Object.entries(updates).filter(([k]) => k !== 'updated_at').map(([, v]) => v),
        now,
        userId,
      ];
      await db.run(`UPDATE users SET ${setClauses} WHERE id = ?`, values);
    }

    res.json({ 
      success: true, 
      message: 'Perfil atualizado com sucesso',
      ...(name !== undefined && { name: name.trim() }),
      ...(preferred_name !== undefined && { preferred_name: preferred_name.trim() || null }),
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
 * GET /api/users/whatsapp-numbers
 * Returns all WhatsApp numbers linked to the authenticated user.
 */
router.get('/whatsapp-numbers', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    let numbers: any[];

    if (isPostgreSQL()) {
      const pool = getPool();
      const result = await pool.query(
        `SELECT id, phone, nickname, verified, link_code IS NOT NULL AS has_pending_code,
                link_code_expires_at, created_at
         FROM user_whatsapp_numbers
         WHERE user_id = $1
         ORDER BY created_at ASC`,
        [userId]
      );
      numbers = result.rows;
    } else {
      const db = getDatabase();
      numbers = await db.all(
        `SELECT id, phone, nickname, verified, (link_code IS NOT NULL) AS has_pending_code,
                link_code_expires_at, created_at
         FROM user_whatsapp_numbers
         WHERE user_id = ?
         ORDER BY created_at ASC`,
        [userId]
      );
    }

    const now = Date.now();
    const mapped = numbers.map((n: any) => {
      const expiresAtDate = n.link_code_expires_at ? new Date(n.link_code_expires_at) : null;
      const hasValidExpiry = !!expiresAtDate && !Number.isNaN(expiresAtDate.getTime()) && expiresAtDate.getTime() > now;
      return {
        id: n.id,
        phone: n.phone,
        nickname: n.nickname,
        linked: Boolean(n.verified),
        awaitingCode: Boolean(!n.verified && n.has_pending_code && hasValidExpiry),
        linkCodeExpiresAt: hasValidExpiry ? expiresAtDate!.toISOString() : null,
      };
    });

    res.json(mapped);
  } catch (error) {
    console.error('Error fetching WhatsApp numbers:', error);
    res.status(500).json({ error: 'Erro ao carregar números de WhatsApp' });
  }
});

/**
 * POST /api/users/whatsapp-numbers/request
 * Generates verification code and sends it via WhatsApp for a new number.
 */
router.post('/whatsapp-numbers/request', authenticateToken, async (req: Request, res: Response) => {
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
    const digits = normalizedPhone.replace(/\D/g, '');
    const defaultNickname = digits.length >= 4 ? digits.slice(-4) : digits;

    let numberId: string;

    try {
      if (isPostgreSQL()) {
        const pool = getPool();
        const existing = await pool.query(
          'SELECT id, user_id FROM user_whatsapp_numbers WHERE phone = $1',
          [normalizedPhone]
        );
        if (existing.rows.length > 0) {
          if (existing.rows[0].user_id !== userId) {
            res.status(409).json({ error: 'Este número já está vinculado a outra conta.' });
            return;
          }
          numberId = existing.rows[0].id;
          await pool.query(
            `UPDATE user_whatsapp_numbers
             SET verified = FALSE, link_code = $1, link_code_expires_at = $2, updated_at = $3
             WHERE id = $4`,
            [linkCode, expiresAt, now, numberId]
          );
        } else {
          numberId = uuidv4();
          await pool.query(
            `INSERT INTO user_whatsapp_numbers (id, user_id, phone, nickname, verified, link_code, link_code_expires_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, FALSE, $5, $6, $7, $8)`,
            [numberId, userId, normalizedPhone, defaultNickname, linkCode, expiresAt, now, now]
          );
        }
      } else {
        const db = getDatabase();
        const existing = await db.get(
          'SELECT id, user_id FROM user_whatsapp_numbers WHERE phone = ?',
          [normalizedPhone]
        );
        if (existing) {
          if (existing.user_id !== userId) {
            res.status(409).json({ error: 'Este número já está vinculado a outra conta.' });
            return;
          }
          numberId = existing.id;
          await db.run(
            `UPDATE user_whatsapp_numbers
             SET verified = 0, link_code = ?, link_code_expires_at = ?, updated_at = ?
             WHERE id = ?`,
            [linkCode, expiresAt, now, numberId]
          );
        } else {
          numberId = uuidv4();
          await db.run(
            `INSERT INTO user_whatsapp_numbers (id, user_id, phone, nickname, verified, link_code, link_code_expires_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`,
            [numberId, userId, normalizedPhone, defaultNickname, linkCode, expiresAt, now, now]
          );
        }
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

    await sendVerificationCode(normalizedPhone, linkCode);

    res.json({
      success: true,
      message: 'Código enviado via WhatsApp.',
      expiresAt,
      phone: normalizedPhone,
      numberId,
    });
  } catch (error) {
    console.error('Error requesting WhatsApp link:', error);
    res.status(500).json({ error: 'Erro ao solicitar vinculação do WhatsApp' });
  }
});

/**
 * POST /api/users/whatsapp-numbers/verify
 * Verifies code and marks a WhatsApp number as linked.
 */
router.post('/whatsapp-numbers/verify', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }
    const providedCode = String(req.body?.code || '').replace(/\D/g, '').slice(0, 6);
    const phone = typeof req.body?.phone === 'string' ? normalizeWhatsappPhone(req.body.phone) : '';

    if (providedCode.length !== 6) {
      res.status(400).json({ error: 'Código inválido' });
      return;
    }

    let numberRow: any;
    const now = new Date().toISOString();

    if (isPostgreSQL()) {
      const pool = getPool();
      const result = await pool.query(
        `SELECT id, phone, link_code, link_code_expires_at
         FROM user_whatsapp_numbers
         WHERE user_id = $1 AND phone = $2`,
        [userId, phone]
      );
      numberRow = result.rows[0];
    } else {
      const db = getDatabase();
      numberRow = await db.get(
        `SELECT id, phone, link_code, link_code_expires_at
         FROM user_whatsapp_numbers
         WHERE user_id = ? AND phone = ?`,
        [userId, phone]
      );
    }

    if (!numberRow) {
      res.status(404).json({ error: 'Número não encontrado' });
      return;
    }

    if (!numberRow.link_code || !numberRow.link_code_expires_at) {
      res.status(400).json({ error: 'Nenhuma solicitação de vinculação pendente' });
      return;
    }

    const expiresAt = new Date(numberRow.link_code_expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
      res.status(400).json({ error: 'Código expirado. Solicite um novo código.' });
      return;
    }

    if (providedCode !== String(numberRow.link_code)) {
      res.status(400).json({ error: 'Código inválido' });
      return;
    }

    if (isPostgreSQL()) {
      const pool = getPool();
      await pool.query(
        `UPDATE user_whatsapp_numbers
         SET verified = TRUE, link_code = NULL, link_code_expires_at = NULL, updated_at = $1
         WHERE id = $2`,
        [now, numberRow.id]
      );
    } else {
      const db = getDatabase();
      await db.run(
        `UPDATE user_whatsapp_numbers
         SET verified = 1, link_code = NULL, link_code_expires_at = NULL, updated_at = ?
         WHERE id = ?`,
        [now, numberRow.id]
      );
    }

    res.json({
      success: true,
      message: 'WhatsApp vinculado com sucesso.',
      phone: numberRow.phone,
    });
  } catch (error) {
    console.error('Error verifying WhatsApp link:', error);
    res.status(500).json({ error: 'Erro ao verificar código de vinculação' });
  }
});

/**
 * PUT /api/users/whatsapp-numbers/:id
 * Updates the nickname for a WhatsApp number.
 */
router.put('/whatsapp-numbers/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const numberId = req.params.id;
    const nickname = typeof req.body?.nickname === 'string' ? req.body.nickname.trim() : '';

    if (!nickname) {
      res.status(400).json({ error: 'Apelido é obrigatório' });
      return;
    }

    if (nickname.length > 30) {
      res.status(400).json({ error: 'Apelido deve ter no máximo 30 caracteres' });
      return;
    }

    const now = new Date().toISOString();

    if (isPostgreSQL()) {
      const pool = getPool();
      const result = await pool.query(
        `UPDATE user_whatsapp_numbers SET nickname = $1, updated_at = $2
         WHERE id = $3 AND user_id = $4
         RETURNING id, phone, nickname`,
        [nickname, now, numberId, userId]
      );
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Número não encontrado' });
        return;
      }
      res.json({ success: true, ...result.rows[0] });
    } else {
      const db = getDatabase();
      const existing = await db.get(
        'SELECT id FROM user_whatsapp_numbers WHERE id = ? AND user_id = ?',
        [numberId, userId]
      );
      if (!existing) {
        res.status(404).json({ error: 'Número não encontrado' });
        return;
      }
      await db.run(
        'UPDATE user_whatsapp_numbers SET nickname = ?, updated_at = ? WHERE id = ?',
        [nickname, now, numberId]
      );
      res.json({ success: true, id: numberId, nickname });
    }
  } catch (error) {
    console.error('Error updating WhatsApp number nickname:', error);
    res.status(500).json({ error: 'Erro ao atualizar apelido' });
  }
});

/**
 * DELETE /api/users/whatsapp-numbers/:id
 * Removes a WhatsApp number from the account.
 */
router.delete('/whatsapp-numbers/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const numberId = req.params.id;

    if (isPostgreSQL()) {
      const pool = getPool();
      const result = await pool.query(
        'DELETE FROM user_whatsapp_numbers WHERE id = $1 AND user_id = $2 RETURNING id',
        [numberId, userId]
      );
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Número não encontrado' });
        return;
      }
    } else {
      const db = getDatabase();
      const existing = await db.get(
        'SELECT id FROM user_whatsapp_numbers WHERE id = ? AND user_id = ?',
        [numberId, userId]
      );
      if (!existing) {
        res.status(404).json({ error: 'Número não encontrado' });
        return;
      }
      await db.run('DELETE FROM user_whatsapp_numbers WHERE id = ?', [numberId]);
    }

    res.json({ success: true, message: 'Número de WhatsApp removido.' });
  } catch (error) {
    console.error('Error removing WhatsApp number:', error);
    res.status(500).json({ error: 'Erro ao remover número de WhatsApp' });
  }
});

// Legacy single-number endpoints (backward compatibility)

/**
 * GET /api/users/whatsapp-link
 * Returns WhatsApp link status (legacy - returns first number).
 */
router.get('/whatsapp-link', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    let numberRow: any;
    if (isPostgreSQL()) {
      const pool = getPool();
      const result = await pool.query(
        `SELECT phone, verified, link_code, link_code_expires_at
         FROM user_whatsapp_numbers WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1`,
        [userId]
      );
      numberRow = result.rows[0];
    } else {
      const db = getDatabase();
      numberRow = await db.get(
        `SELECT phone, verified, link_code, link_code_expires_at
         FROM user_whatsapp_numbers WHERE user_id = ? ORDER BY created_at ASC LIMIT 1`,
        [userId]
      );
    }

    if (!numberRow) {
      res.json({ phone: null, linked: false, awaitingCode: false, linkCodeExpiresAt: null });
      return;
    }

    const linked = Boolean(numberRow.verified);
    const hasPendingCode = Boolean(numberRow.link_code);
    const expiresAtDate = numberRow.link_code_expires_at ? new Date(numberRow.link_code_expires_at) : null;
    const hasValidExpiry = !!expiresAtDate && !Number.isNaN(expiresAtDate.getTime()) && expiresAtDate.getTime() > Date.now();

    res.json({
      phone: numberRow.phone,
      linked,
      awaitingCode: Boolean(!linked && hasPendingCode && hasValidExpiry),
      linkCodeExpiresAt: hasValidExpiry ? expiresAtDate!.toISOString() : null,
    });
  } catch (error) {
    console.error('Error fetching WhatsApp link status:', error);
    res.status(500).json({ error: 'Erro ao carregar status de vinculação do WhatsApp' });
  }
});

/** POST /api/users/whatsapp-link/request - Legacy: delegates to multi-number request */
router.post('/whatsapp-link/request', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Usuário não autenticado' }); return; }
    const phone = typeof req.body?.phone === 'string' ? req.body.phone : '';
    const normalizedPhone = normalizeWhatsappPhone(phone);
    if (!normalizedPhone || normalizedPhone.length < 12) {
      res.status(400).json({ error: 'Número de WhatsApp inválido. Use formato com DDI e DDD.' }); return;
    }
    const linkCode = generateWhatsappLinkCode();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const digits = normalizedPhone.replace(/\D/g, '');
    const defaultNickname = digits.length >= 4 ? digits.slice(-4) : digits;
    if (isPostgreSQL()) {
      const pool = getPool();
      const existing = await pool.query('SELECT id, user_id FROM user_whatsapp_numbers WHERE phone = $1', [normalizedPhone]);
      if (existing.rows.length > 0 && existing.rows[0].user_id !== userId) {
        res.status(409).json({ error: 'Este número já está vinculado a outra conta.' }); return;
      }
      if (existing.rows.length > 0) {
        await pool.query('UPDATE user_whatsapp_numbers SET verified = FALSE, link_code = $1, link_code_expires_at = $2, updated_at = $3 WHERE id = $4', [linkCode, expiresAt, now, existing.rows[0].id]);
      } else {
        await pool.query('INSERT INTO user_whatsapp_numbers (id, user_id, phone, nickname, verified, link_code, link_code_expires_at, created_at, updated_at) VALUES ($1,$2,$3,$4,FALSE,$5,$6,$7,$8)', [uuidv4(), userId, normalizedPhone, defaultNickname, linkCode, expiresAt, now, now]);
      }
    } else {
      const db = getDatabase();
      const existing = await db.get('SELECT id, user_id FROM user_whatsapp_numbers WHERE phone = ?', [normalizedPhone]);
      if (existing && existing.user_id !== userId) {
        res.status(409).json({ error: 'Este número já está vinculado a outra conta.' }); return;
      }
      if (existing) {
        await db.run('UPDATE user_whatsapp_numbers SET verified = 0, link_code = ?, link_code_expires_at = ?, updated_at = ? WHERE id = ?', [linkCode, expiresAt, now, existing.id]);
      } else {
        await db.run('INSERT INTO user_whatsapp_numbers (id, user_id, phone, nickname, verified, link_code, link_code_expires_at, created_at, updated_at) VALUES (?,?,?,?,0,?,?,?,?)', [uuidv4(), userId, normalizedPhone, defaultNickname, linkCode, expiresAt, now, now]);
      }
    }
    await sendVerificationCode(normalizedPhone, linkCode);
    res.json({ success: true, message: 'Código enviado via WhatsApp.', expiresAt, phone: normalizedPhone });
  } catch (error) {
    console.error('Error requesting WhatsApp link (legacy):', error);
    res.status(500).json({ error: 'Erro ao solicitar vinculação do WhatsApp' });
  }
});

/** POST /api/users/whatsapp-link/verify - Legacy: delegates to multi-number verify */
router.post('/whatsapp-link/verify', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Usuário não autenticado' }); return; }
    const providedCode = String(req.body?.code || '').replace(/\D/g, '').slice(0, 6);
    if (providedCode.length !== 6) { res.status(400).json({ error: 'Código inválido' }); return; }
    const now = new Date().toISOString();
    let numberRow: any;
    if (isPostgreSQL()) {
      const pool = getPool();
      const result = await pool.query('SELECT id, phone, link_code, link_code_expires_at FROM user_whatsapp_numbers WHERE user_id = $1 AND link_code IS NOT NULL ORDER BY updated_at DESC LIMIT 1', [userId]);
      numberRow = result.rows[0];
    } else {
      const db = getDatabase();
      numberRow = await db.get('SELECT id, phone, link_code, link_code_expires_at FROM user_whatsapp_numbers WHERE user_id = ? AND link_code IS NOT NULL ORDER BY updated_at DESC LIMIT 1', [userId]);
    }
    if (!numberRow || !numberRow.link_code) { res.status(400).json({ error: 'Nenhuma solicitação de vinculação pendente' }); return; }
    const expiresAt = new Date(numberRow.link_code_expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) { res.status(400).json({ error: 'Código expirado.' }); return; }
    if (providedCode !== String(numberRow.link_code)) { res.status(400).json({ error: 'Código inválido' }); return; }
    if (isPostgreSQL()) {
      await getPool().query('UPDATE user_whatsapp_numbers SET verified = TRUE, link_code = NULL, link_code_expires_at = NULL, updated_at = $1 WHERE id = $2', [now, numberRow.id]);
    } else {
      await getDatabase().run('UPDATE user_whatsapp_numbers SET verified = 1, link_code = NULL, link_code_expires_at = NULL, updated_at = ? WHERE id = ?', [now, numberRow.id]);
    }
    res.json({ success: true, message: 'WhatsApp vinculado com sucesso.', phone: numberRow.phone });
  } catch (error) {
    console.error('Error verifying WhatsApp link (legacy):', error);
    res.status(500).json({ error: 'Erro ao verificar código de vinculação' });
  }
});

/** DELETE /api/users/whatsapp-link - Legacy: removes first linked number */
router.delete('/whatsapp-link', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    if (isPostgreSQL()) {
      const pool = getPool();
      await pool.query(
        `DELETE FROM user_whatsapp_numbers
         WHERE id = (SELECT id FROM user_whatsapp_numbers WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1)`,
        [userId]
      );
    } else {
      const db = getDatabase();
      await db.run(
        `DELETE FROM user_whatsapp_numbers
         WHERE id = (SELECT id FROM user_whatsapp_numbers WHERE user_id = ? ORDER BY created_at ASC LIMIT 1)`,
        [userId]
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

/**
 * GET /api/users/timezone
 * Returns the authenticated user's timezone setting.
 */
router.get('/timezone', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    let timezone = 'America/Sao_Paulo';

    if (isPostgreSQL()) {
      const pool = getPool();
      const result = await pool.query('SELECT timezone FROM users WHERE id = $1', [userId]);
      timezone = result.rows[0]?.timezone || 'America/Sao_Paulo';
    } else {
      const db = getDatabase();
      const row = await db.get<{ timezone?: string }>('SELECT timezone FROM users WHERE id = ?', [userId]);
      timezone = row?.timezone || 'America/Sao_Paulo';
    }

    res.json({ timezone });
  } catch (error) {
    console.error('Error fetching timezone:', error);
    res.status(500).json({ error: 'Erro ao carregar fuso horário' });
  }
});

/**
 * PUT /api/users/timezone
 * Updates the authenticated user's timezone setting.
 */
router.put('/timezone', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const { timezone } = req.body as { timezone?: string };
    if (!timezone || typeof timezone !== 'string') {
      res.status(400).json({ error: 'timezone é obrigatório' });
      return;
    }

    // Validate timezone using Intl API
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
      res.status(400).json({ error: 'Fuso horário inválido' });
      return;
    }

    const now = new Date().toISOString();

    if (isPostgreSQL()) {
      await getPool().query('UPDATE users SET timezone = $1, updated_at = $2 WHERE id = $3', [timezone, now, userId]);
    } else {
      await getDatabase().run('UPDATE users SET timezone = ?, updated_at = ? WHERE id = ?', [timezone, now, userId]);
    }

    res.json({ success: true, timezone });
  } catch (error) {
    console.error('Error updating timezone:', error);
    res.status(500).json({ error: 'Erro ao atualizar fuso horário' });
  }
});

/**
 * DELETE /api/users/me
 * Hard-delete the authenticated user account.
 *
 * Order of operations:
 *  1. Cancel active Stripe subscription (if any) — keeps audit trail on Stripe side.
 *  2. Delete all user data from the app tables.
 *  3. Delete the users row itself.
 */
router.delete('/me', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    // 1. Cancel Stripe subscription if the user has one (best-effort — don't fail the deletion).
    try {
      await cancelSubscriptionForDeletion(userId);
    } catch (stripeErr) {
      // Log but continue — the account must still be deleted even if Stripe call fails.
      console.error('Delete account: failed to cancel Stripe subscription (continuing):', stripeErr);
    }

    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Delete subtasks first (FK child of tasks)
        await client.query('DELETE FROM task_subtasks WHERE task_id IN (SELECT id FROM tasks WHERE user_id = $1)', [userId]);

        // Delete pending_tasks
        await client.query('DELETE FROM pending_tasks WHERE user_id = $1', [userId]);

        // Delete tasks
        await client.query('DELETE FROM tasks WHERE user_id = $1', [userId]);

        // Delete note_shares where user is owner or shared target
        await client.query(
          'DELETE FROM note_shares WHERE note_id IN (SELECT id FROM notes WHERE user_id = $1) OR shared_with_user_id = $1',
          [userId]
        );

        // Delete notes owned by user
        await client.query('DELETE FROM notes WHERE user_id = $1', [userId]);

        // Delete categories
        await client.query('DELETE FROM categories WHERE user_id = $1', [userId]);

        // Delete lists
        await client.query('DELETE FROM lists WHERE user_id = $1', [userId]);

        // Delete AI memory profile
        await client.query('DELETE FROM user_memory_profiles WHERE user_id = $1', [userId]);

        // Delete Gmail processed emails
        await client.query('DELETE FROM gmail_processed_emails WHERE user_id = $1', [userId]);

        // Delete WhatsApp numbers
        await client.query('DELETE FROM user_whatsapp_numbers WHERE user_id = $1', [userId]);

        // Delete the user row itself (also clears WhatsApp + Gmail OAuth fields)
        await client.query('DELETE FROM users WHERE id = $1', [userId]);

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();

      await db.run('DELETE FROM task_subtasks WHERE task_id IN (SELECT id FROM tasks WHERE user_id = ?)', [userId]);
      await db.run('DELETE FROM pending_tasks WHERE user_id = ?', [userId]);
      await db.run('DELETE FROM tasks WHERE user_id = ?', [userId]);
      await db.run(
        'DELETE FROM note_shares WHERE note_id IN (SELECT id FROM notes WHERE user_id = ?) OR shared_with_user_id = ?',
        [userId, userId]
      );
      await db.run('DELETE FROM notes WHERE user_id = ?', [userId]);
      await db.run('DELETE FROM categories WHERE user_id = ?', [userId]);
      await db.run('DELETE FROM lists WHERE user_id = ?', [userId]);
      await db.run('DELETE FROM user_memory_profiles WHERE user_id = ?', [userId]);
      await db.run('DELETE FROM gmail_processed_emails WHERE user_id = ?', [userId]);
      await db.run('DELETE FROM user_whatsapp_numbers WHERE user_id = ?', [userId]);
      await db.run('DELETE FROM users WHERE id = ?', [userId]);
    }

    console.log(`🗑️ Account deleted for user ${userId}`);
    res.json({ success: true, message: 'Conta deletada com sucesso' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: 'Erro ao deletar conta' });
  }
});

export default router;
