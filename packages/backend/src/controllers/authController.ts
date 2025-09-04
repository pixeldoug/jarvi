import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { getDatabase } from '../database';
import { generateToken } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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

    // Verify the Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

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

    const db = getDatabase();
    const now = new Date().toISOString();

    // Check if user exists
    let user = await db.get('SELECT * FROM users WHERE email = ?', [email]);

    if (!user) {
      // Create new user
      const userId = uuidv4();
      await db.run(
        `
        INSERT INTO users (id, email, name, password, avatar, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        [
          userId,
          email,
          name || 'User',
          'google-auth',
          picture || null,
          now,
          now,
        ]
      );

      user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    } else {
      // Update existing user
      await db.run(
        `
        UPDATE users 
        SET name = ?, avatar = ?, updated_at = ?
        WHERE email = ?
      `,
        [name || user.name, picture || user.avatar, now, email]
      );
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
      },
    });
  } catch (error) {
    console.error('Google auth error:', error);
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

    const db = getDatabase();
    const now = new Date().toISOString();

    // Check if user already exists
    const existingUser = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUser) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const userId = uuidv4();
    await db.run(
      `
      INSERT INTO users (id, email, name, password, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      [userId, email, name, hashedPassword, now, now]
    );

    const newUser = await db.get('SELECT * FROM users WHERE id = ?', [userId]);

    // Generate JWT token
    const token = generateToken({
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
    });

    res.status(201).json({
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        avatar: newUser.avatar,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
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

    const db = getDatabase();

    // Find user by email
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Check if user has a password (not Google-only user)
    if (user.password === 'google-auth') {
      res.status(401).json({ error: 'Please use Google Sign-In for this account' });
      return;
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
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
      },
    });
  } catch (error) {
    console.error('Login error:', error);
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

    const db = getDatabase();
    const user = await db.get('SELECT id, email, name, avatar, created_at FROM users WHERE id = ?', [userId]);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(user);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
};
