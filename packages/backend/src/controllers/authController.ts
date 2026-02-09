import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { generateToken } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { sendVerificationEmail, sendPasswordResetEmail, sendGoogleAccountNoticeEmail } from '../services/emailService';
import { validatePasswordStrength } from '../utils/passwordValidator';
import { generateOtpFromToken } from '../utils/otp';

const INTERNAL_TRIAL_DAYS = 14;

// Helper to generate secure token
const generateSecureToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

// Helper to get token expiration (24 hours for verification, 1 hour for password reset)
const getTokenExpiration = (hours: number): string => {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date.toISOString();
};

const getInternalTrialEndsAtIso = (): string => {
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + INTERNAL_TRIAL_DAYS);
  return trialEnd.toISOString();
};

// Support multiple Google Client IDs (web and mobile)
const webClientId = process.env.GOOGLE_CLIENT_ID; // Web project
const mobileClientId = process.env.GOOGLE_MOBILE_CLIENT_ID; // iOS project
const supportedClientIds = [webClientId, mobileClientId].filter(Boolean);

export const googleAuth = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      res.status(400).json({ error: 'ID token is required' });
      return;
    }

    // Verify the Google ID token with multiple supported client IDs
    let ticket;
    let verifiedClientId;
    
    for (const clientId of supportedClientIds) {
      try {
        const googleClient = new OAuth2Client(clientId);
        ticket = await googleClient.verifyIdToken({
          idToken,
          audience: clientId,
        });
        verifiedClientId = clientId;
        break;
      } catch (error) {
        // Try next client ID
        continue;
      }
    }
    
    if (!ticket) {
      res.status(400).json({ error: 'Invalid ID token for any supported client' });
      return;
    }

    const payload = ticket.getPayload();

    if (!payload) {
      res.status(400).json({ error: 'Invalid ID token' });
      return;
    }

    const { email, name, picture } = payload;

    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const now = new Date().toISOString();
    const trialEndsAt = getInternalTrialEndsAtIso();
    let user;

    if (isPostgreSQL()) {
      // PostgreSQL
      const pool = getPool();
      const client = await pool.connect();
      try {
        // Check if user exists
        const result = await client.query('SELECT * FROM users WHERE email = $1', [email]);

        if (result.rows.length === 0) {
          // Create new user (Google users are automatically verified)
          const userId = uuidv4();
          await client.query(
            `INSERT INTO users (id, email, name, password, avatar, auth_provider, has_password, email_verified, subscription_status, trial_ends_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              userId,
              email,
              name || 'User',
              'google-auth',
              picture || null,
              'google',
              false,
              true, // Google users are verified
              'trialing',
              trialEndsAt,
              now,
              now,
            ]
          );

          const newUserResult = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
          user = newUserResult.rows[0];
        } else {
          user = result.rows[0];
          // Update existing user - DON'T change auth_provider if user has password
          const shouldUpdateAuthProvider = user.password === 'google-auth';
          
          if (shouldUpdateAuthProvider) {
            await client.query(
              `UPDATE users 
               SET name = $1, avatar = $2, auth_provider = $3, email_verified = $4, updated_at = $5
               WHERE email = $6`,
              [name || user.name, picture || user.avatar, 'google', true, now, email]
            );
          } else {
            // User has password, just update name/avatar, keep auth_provider as is
            await client.query(
              `UPDATE users 
               SET name = $1, avatar = $2, email_verified = $3, updated_at = $4
               WHERE email = $5`,
              [name || user.name, picture || user.avatar, true, now, email]
            );
          }
          
          // Re-fetch updated user
          const updatedResult = await client.query('SELECT * FROM users WHERE email = $1', [email]);
          user = updatedResult.rows[0];
        }
      } finally {
        client.release();
      }
    } else {
      // SQLite
      const db = getDatabase();
      
      // Check if user exists
      user = await db.get('SELECT * FROM users WHERE email = ?', [email]);

      if (!user) {
        // Create new user (Google users are automatically verified)
        const userId = uuidv4();
        await db.run(
          `INSERT INTO users (id, email, name, password, avatar, auth_provider, has_password, email_verified, subscription_status, trial_ends_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            email,
            name || 'User',
            'google-auth',
            picture || null,
            'google',
            false,
            true, // Google users are verified
            'trialing',
            trialEndsAt,
            now,
            now,
          ]
        );

        user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
      } else {
        // Update existing user - DON'T change auth_provider if user has password
        const shouldUpdateAuthProvider = user.password === 'google-auth';
        
        if (shouldUpdateAuthProvider) {
          await db.run(
            `UPDATE users 
             SET name = ?, avatar = ?, auth_provider = ?, email_verified = ?, updated_at = ?
             WHERE email = ?`,
            [name || user.name, picture || user.avatar, 'google', true, now, email]
          );
        } else {
          // User has password, just update name/avatar, keep auth_provider as is
          await db.run(
            `UPDATE users 
             SET name = ?, avatar = ?, email_verified = ?, updated_at = ?
             WHERE email = ?`,
            [name || user.name, picture || user.avatar, true, now, email]
          );
        }
        
        // Re-fetch updated user
        user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
      }
    }

    // Generate JWT token
    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        authProvider: user.auth_provider || 'google',
        hasPassword: !!user.has_password,
      },
    });
  } catch (error) {
    // Log error without exposing sensitive details
    console.error('Google auth error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      ip: req.ip
    });
    res.status(500).json({ error: 'Authentication failed' });
  }
};

export const register = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email, name, password } = req.body;

    if (!email || !name || !password) {
      res.status(400).json({ error: 'Email, name and password are required' });
      return;
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password, [email, name], 2);
    if (!passwordValidation.isValid) {
      res.status(400).json({ 
        error: passwordValidation.message,
        feedback: passwordValidation.feedback,
      });
      return;
    }

    const now = new Date().toISOString();
    const trialEndsAt = getInternalTrialEndsAtIso();
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    const verificationToken = generateSecureToken();
    const tokenExpires = getTokenExpiration(24); // 24 hours
    let newUser;

    if (isPostgreSQL()) {
      // PostgreSQL
      const pool = getPool();
      const client = await pool.connect();
      try {
        // Check if user already exists
        const existingResult = await client.query('SELECT * FROM users WHERE email = $1', [email]);
        if (existingResult.rows.length > 0) {
          res.status(400).json({ error: 'User already exists' });
          return;
        }

        // Create new user with email_verified = false
        await client.query(
          `INSERT INTO users (id, email, name, password, auth_provider, has_password, email_verified, email_verification_token, email_verification_expires, subscription_status, trial_ends_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [userId, email, name, hashedPassword, 'email', true, false, verificationToken, tokenExpires, 'trialing', trialEndsAt, now, now]
        );

        const result = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
        newUser = result.rows[0];
      } finally {
        client.release();
      }
    } else {
      // SQLite
      const db = getDatabase();

      // Check if user already exists
      const existingUser = await db.get('SELECT * FROM users WHERE email = ?', [email]);
      if (existingUser) {
        res.status(400).json({ error: 'User already exists' });
        return;
      }

      // Create new user with email_verified = false
      await db.run(
        `INSERT INTO users (id, email, name, password, auth_provider, has_password, email_verified, email_verification_token, email_verification_expires, subscription_status, trial_ends_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, email, name, hashedPassword, 'email', true, false, verificationToken, tokenExpires, 'trialing', trialEndsAt, now, now]
      );

      newUser = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    }

    // Send verification email
    try {
      await sendVerificationEmail(email, name, verificationToken);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Don't fail registration if email fails, user can resend
    }

    // Return success but indicate email verification is pending
    res.status(201).json({
      pendingVerification: true,
      message: 'Conta criada com sucesso! Verifique seu email para ativar sua conta.',
      email: newUser.email,
    });
  } catch (error) {
    // Log error without exposing sensitive details
    console.error('Registration error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      ip: req.ip
    });
    res.status(500).json({ error: 'Registration failed' });
  }
};

export const login = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    let user;

    if (isPostgreSQL()) {
      // PostgreSQL
      const pool = getPool();
      const client = await pool.connect();
      try {
        const result = await client.query('SELECT * FROM users WHERE email = $1', [email]);
        user = result.rows[0];
      } finally {
        client.release();
      }
    } else {
      // SQLite
      const db = getDatabase();
      user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    }

    if (!user) {
      res.status(401).json({ error: 'E-mail ou senha incorretos' });
      return;
    }

    // Check if user has a password (not Google-only user)
    if (user.auth_provider === 'google' || user.password === 'google-auth') {
      res.status(401).json({ error: 'Please use Google Sign-In for this account' });
      return;
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      res.status(401).json({ error: 'E-mail ou senha incorretos' });
      return;
    }

    // Check if email is verified
    if (!user.email_verified) {
      res.status(403).json({ 
        error: 'Email não verificado',
        pendingVerification: true,
        email: user.email,
        message: 'Por favor, verifique seu email antes de fazer login.'
      });
      return;
    }

    // Generate JWT token
    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        authProvider: user.auth_provider || 'email',
        hasPassword: !!user.has_password,
      },
    });
  } catch (error) {
    // Log error without exposing sensitive details
    console.error('Login error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      ip: req.ip
    });
    res.status(500).json({ error: 'Login failed' });
  }
};

export const getProfile = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    let user;

    if (isPostgreSQL()) {
      // PostgreSQL
      const pool = getPool();
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT id, email, name, avatar, auth_provider, has_password, created_at FROM users WHERE id = $1',
          [userId]
        );
        user = result.rows[0];
      } finally {
        client.release();
      }
    } else {
      // SQLite
      const db = getDatabase();
      user = await db.get('SELECT id, email, name, avatar, auth_provider, has_password, created_at FROM users WHERE id = ?', [userId]);
    }

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      ...user,
      authProvider: user.auth_provider || 'email',
      hasPassword: !!user.has_password,
    });
  } catch (error) {
    // Log error without exposing sensitive details
    console.error('Get profile error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      ip: req.ip
    });
    res.status(500).json({ error: 'Failed to get profile' });
  }
};

export const verifyEmail = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({ error: 'Token is required' });
      return;
    }

    const now = new Date().toISOString();
    let user;

    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        // Find user with this token
        const result = await client.query(
          'SELECT * FROM users WHERE email_verification_token = $1',
          [token]
        );
        user = result.rows[0];

        if (!user) {
          res.status(400).json({ error: 'Token inválido ou expirado' });
          return;
        }

        // Check if token is expired
        if (user.email_verification_expires && new Date(user.email_verification_expires) < new Date()) {
          res.status(400).json({ error: 'Token expirado. Solicite um novo email de verificação.' });
          return;
        }

        // Update user as verified
        await client.query(
          `UPDATE users 
           SET email_verified = $1, email_verification_token = NULL, email_verification_expires = NULL, updated_at = $2
           WHERE id = $3`,
          [true, now, user.id]
        );
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      
      // Find user with this token
      user = await db.get(
        'SELECT * FROM users WHERE email_verification_token = ?',
        [token]
      );

      if (!user) {
        res.status(400).json({ error: 'Token inválido ou expirado' });
        return;
      }

      // Check if token is expired
      if (user.email_verification_expires && new Date(user.email_verification_expires) < new Date()) {
        res.status(400).json({ error: 'Token expirado. Solicite um novo email de verificação.' });
        return;
      }

      // Update user as verified
      await db.run(
        `UPDATE users 
         SET email_verified = ?, email_verification_token = NULL, email_verification_expires = NULL, updated_at = ?
         WHERE id = ?`,
        [true, now, user.id]
      );
    }

    res.json({ 
      success: true, 
      message: 'Email verificado com sucesso! Você já pode fazer login.' 
    });
  } catch (error) {
    console.error('Verify email error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      ip: req.ip
    });
    res.status(500).json({ error: 'Failed to verify email' });
  }
};

/**
 * Verificação de e-mail via OTP (código) para evitar dependência de link.
 * Corpo: { email, code }
 */
export const verifyEmailOtp = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email, code } = req.body as { email?: string; code?: string };

    if (!email || !code) {
      res.status(400).json({ error: 'Email e código são obrigatórios' });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedCode = String(code).replace(/\D/g, '').slice(0, 6);

    if (normalizedCode.length !== 6) {
      res.status(400).json({ error: 'Código inválido ou expirado' });
      return;
    }

    const now = new Date().toISOString();
    let user: any;

    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const result = await client.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
        user = result.rows[0];

        // Não revelar existência de e-mail: mesma mensagem de erro
        if (!user || user.email_verified || !user.email_verification_token) {
          res.status(400).json({ error: 'Código inválido ou expirado' });
          return;
        }

        if (user.email_verification_expires && new Date(user.email_verification_expires) < new Date()) {
          res.status(400).json({ error: 'Código inválido ou expirado' });
          return;
        }

        const expected = generateOtpFromToken(user.email_verification_token);
        if (expected !== normalizedCode) {
          res.status(400).json({ error: 'Código inválido ou expirado' });
          return;
        }

        await client.query(
          `UPDATE users 
           SET email_verified = $1, email_verification_token = NULL, email_verification_expires = NULL, updated_at = $2
           WHERE id = $3`,
          [true, now, user.id]
        );
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      user = await db.get('SELECT * FROM users WHERE email = ?', [normalizedEmail]);

      if (!user || user.email_verified || !user.email_verification_token) {
        res.status(400).json({ error: 'Código inválido ou expirado' });
        return;
      }

      if (user.email_verification_expires && new Date(user.email_verification_expires) < new Date()) {
        res.status(400).json({ error: 'Código inválido ou expirado' });
        return;
      }

      const expected = generateOtpFromToken(user.email_verification_token);
      if (expected !== normalizedCode) {
        res.status(400).json({ error: 'Código inválido ou expirado' });
        return;
      }

      await db.run(
        `UPDATE users 
         SET email_verified = ?, email_verification_token = NULL, email_verification_expires = NULL, updated_at = ?
         WHERE id = ?`,
        [true, now, user.id]
      );
    }

    // Auto-login após verificação bem-sucedida
    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        authProvider: user.auth_provider || 'email',
        hasPassword: !!user.has_password,
      },
    });
  } catch (error) {
    console.error('Verify email OTP error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      ip: req.ip,
    });
    res.status(500).json({ error: 'Failed to verify email' });
  }
};

export const resendVerification = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const now = new Date().toISOString();
    const newToken = generateSecureToken();
    const tokenExpires = getTokenExpiration(24);
    let user;

    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const result = await client.query('SELECT * FROM users WHERE email = $1', [email]);
        user = result.rows[0];

        if (!user) {
          // Don't reveal if email exists or not for security
          res.json({ success: true, message: 'Se o email existir, você receberá um código de verificação.' });
          return;
        }

        if (user.email_verified) {
          res.status(400).json({ error: 'Este email já está verificado.' });
          return;
        }

        // Update token
        await client.query(
          `UPDATE users 
           SET email_verification_token = $1, email_verification_expires = $2, updated_at = $3
           WHERE id = $4`,
          [newToken, tokenExpires, now, user.id]
        );
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      user = await db.get('SELECT * FROM users WHERE email = ?', [email]);

      if (!user) {
        res.json({ success: true, message: 'Se o email existir, você receberá um código de verificação.' });
        return;
      }

      if (user.email_verified) {
        res.status(400).json({ error: 'Este email já está verificado.' });
        return;
      }

      // Update token
      await db.run(
        `UPDATE users 
         SET email_verification_token = ?, email_verification_expires = ?, updated_at = ?
         WHERE id = ?`,
        [newToken, tokenExpires, now, user.id]
      );
    }

    // Send verification email
    try {
      await sendVerificationEmail(user.email, user.name, newToken);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      res.status(500).json({ error: 'Failed to send verification email' });
      return;
    }

    res.json({ success: true, message: 'Código de verificação enviado!' });
  } catch (error) {
    console.error('Resend verification error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      ip: req.ip
    });
    res.status(500).json({ error: 'Failed to resend verification email' });
  }
};

export const forgotPassword = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const now = new Date().toISOString();
    const resetToken = generateSecureToken();
    const tokenExpires = getTokenExpiration(1); // 1 hour
    let user;

    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const result = await client.query('SELECT * FROM users WHERE email = $1', [email]);
        user = result.rows[0];

        if (!user) {
          // Don't reveal if email exists for security
          res.json({ success: true, message: 'Se o email existir, você receberá um link para redefinir sua senha.' });
          return;
        }

        // Can't reset password for Google-only users - send notice email
        if (user.auth_provider === 'google' || user.password === 'google-auth') {
          try {
            await sendGoogleAccountNoticeEmail(user.email, user.name);
          } catch (emailError) {
            console.error('Failed to send Google account notice email:', emailError);
            // Don't return error - respond with generic message for security
          }
          res.json({ success: true, message: 'Se o email existir, você receberá um link para redefinir sua senha.' });
          return;
        }

        // Update reset token
        await client.query(
          `UPDATE users 
           SET password_reset_token = $1, password_reset_expires = $2, updated_at = $3
           WHERE id = $4`,
          [resetToken, tokenExpires, now, user.id]
        );
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      user = await db.get('SELECT * FROM users WHERE email = ?', [email]);

      if (!user) {
        res.json({ success: true, message: 'Se o email existir, você receberá um link para redefinir sua senha.' });
        return;
      }

      if (user.password === 'google-auth' || user.auth_provider === 'google') {
        try {
          await sendGoogleAccountNoticeEmail(user.email, user.name);
        } catch (emailError) {
          console.error('Failed to send Google account notice email:', emailError);
          // Don't return error - respond with generic message for security
        }
        res.json({ success: true, message: 'Se o email existir, você receberá um link para redefinir sua senha.' });
        return;
      }

      // Update reset token
      await db.run(
        `UPDATE users 
         SET password_reset_token = ?, password_reset_expires = ?, updated_at = ?
         WHERE id = ?`,
        [resetToken, tokenExpires, now, user.id]
      );
    }

    // Send reset email
    try {
      await sendPasswordResetEmail(user.email, user.name, resetToken);
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
      res.status(500).json({ error: 'Failed to send password reset email' });
      return;
    }

    res.json({ success: true, message: 'Se o email existir, você receberá um link para redefinir sua senha.' });
  } catch (error) {
    console.error('Forgot password error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      ip: req.ip
    });
    res.status(500).json({ error: 'Failed to process forgot password request' });
  }
};

export const resetPassword = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      res.status(400).json({ error: 'Token and password are required' });
      return;
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password, [], 2);
    if (!passwordValidation.isValid) {
      res.status(400).json({ 
        error: passwordValidation.message,
        feedback: passwordValidation.feedback,
      });
      return;
    }

    const now = new Date().toISOString();
    const hashedPassword = await bcrypt.hash(password, 10);
    let user;

    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        // Find user with this reset token
        const result = await client.query(
          'SELECT * FROM users WHERE password_reset_token = $1',
          [token]
        );
        user = result.rows[0];

        if (!user) {
          res.status(400).json({ error: 'Token inválido ou expirado' });
          return;
        }

        // Check if token is expired
        if (user.password_reset_expires && new Date(user.password_reset_expires) < new Date()) {
          res.status(400).json({ error: 'Token expirado. Solicite um novo link de redefinição.' });
          return;
        }

        // Update password and clear reset token
        await client.query(
          `UPDATE users 
           SET password = $1, password_reset_token = NULL, password_reset_expires = NULL, updated_at = $2
           WHERE id = $3`,
          [hashedPassword, now, user.id]
        );
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      
      // Find user with this reset token
      user = await db.get(
        'SELECT * FROM users WHERE password_reset_token = ?',
        [token]
      );

      if (!user) {
        res.status(400).json({ error: 'Token inválido ou expirado' });
        return;
      }

      // Check if token is expired
      if (user.password_reset_expires && new Date(user.password_reset_expires) < new Date()) {
        res.status(400).json({ error: 'Token expirado. Solicite um novo link de redefinição.' });
        return;
      }

      // Update password and clear reset token
      await db.run(
        `UPDATE users 
         SET password = ?, password_reset_token = NULL, password_reset_expires = NULL, updated_at = ?
         WHERE id = ?`,
        [hashedPassword, now, user.id]
      );
    }

    res.json({ 
      success: true, 
      message: 'Senha redefinida com sucesso! Você já pode fazer login.' 
    });
  } catch (error) {
    console.error('Reset password error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      ip: req.ip
    });
    res.status(500).json({ error: 'Failed to reset password' });
  }
};

export const addPasswordToGoogleAccount = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { password } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (!password) {
      res.status(400).json({ error: 'Password is required' });
      return;
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password, [], 2);
    if (!passwordValidation.isValid) {
      res.status(400).json({ 
        error: passwordValidation.message,
        feedback: passwordValidation.feedback,
      });
      return;
    }

    const now = new Date().toISOString();
    const hashedPassword = await bcrypt.hash(password, 10);
    let user;

    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        // Get current user
        const result = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
        user = result.rows[0];

        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        // Verify user is Google-authenticated
        if (user.auth_provider !== 'google' && user.password !== 'google-auth') {
          res.status(400).json({ error: 'This account is not connected with Google or already has a password' });
          return;
        }

        // Convert to email/password account
        await client.query(
          `UPDATE users 
           SET password = $1, auth_provider = $2, has_password = $3, updated_at = $4
           WHERE id = $5`,
          [hashedPassword, 'email', true, now, userId]
        );
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      
      // Get current user
      user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      // Verify user is Google-authenticated
      if (user.auth_provider !== 'google' && user.password !== 'google-auth') {
        res.status(400).json({ error: 'This account is not connected with Google or already has a password' });
        return;
      }

      // Convert to email/password account
      await db.run(
        `UPDATE users 
         SET password = ?, auth_provider = ?, has_password = ?, updated_at = ?
         WHERE id = ?`,
        [hashedPassword, 'email', true, now, userId]
      );
    }

    res.json({ 
      success: true, 
      message: 'Senha criada com sucesso! Sua conta agora usa email/senha.',
      authProvider: 'email',
      hasPassword: true
    });
  } catch (error) {
    console.error('Add password to Google account error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      ip: req.ip
    });
    res.status(500).json({ error: 'Failed to add password to account' });
  }
};

export const disconnectGoogle = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    let user;

    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const result = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
        user = result.rows[0];

        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        // Verify user is Google-authenticated
        if (user.auth_provider !== 'google' && user.password !== 'google-auth') {
          res.status(400).json({ error: 'This account is not connected with Google' });
          return;
        }

        // Delete the user account
        await client.query('DELETE FROM users WHERE id = $1', [userId]);
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      // Verify user is Google-authenticated
      if (user.auth_provider !== 'google' && user.password !== 'google-auth') {
        res.status(400).json({ error: 'This account is not connected with Google' });
        return;
      }

      // Delete the user account
      await db.run('DELETE FROM users WHERE id = ?', [userId]);
    }

    res.json({ 
      success: true, 
      message: 'Conta Google desconectada e dados deletados com sucesso' 
    });
  } catch (error) {
    console.error('Disconnect Google error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      ip: req.ip
    });
    res.status(500).json({ error: 'Failed to disconnect Google account' });
  }
};
