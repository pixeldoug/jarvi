import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, getPool, isPostgreSQL } from '../database';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHATSAPP_REGEX = /^\+?\d{10,15}$/;

const normalizeEmail = (value: string): string => value.trim().toLowerCase();
const normalizeWhatsapp = (value: string): string => value.trim().replace(/[^\d+]/g, '');

export const joinEarlyAccess = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, whatsapp, wantsBroadcastUpdates } = req.body as {
      email?: string;
      whatsapp?: string;
      wantsBroadcastUpdates?: boolean;
    };

    if (!email || !whatsapp) {
      res.status(400).json({ error: 'Email e WhatsApp são obrigatórios' });
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    const normalizedWhatsapp = normalizeWhatsapp(whatsapp);
    const normalizedWantsBroadcastUpdates = wantsBroadcastUpdates === true;

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      res.status(400).json({ error: 'Formato de email inválido' });
      return;
    }

    if (!WHATSAPP_REGEX.test(normalizedWhatsapp)) {
      res.status(400).json({ error: 'Formato de WhatsApp inválido' });
      return;
    }

    const now = new Date().toISOString();

    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const existingLeadResult = await client.query(
          'SELECT id FROM early_access_leads WHERE email = $1',
          [normalizedEmail]
        );

        if (existingLeadResult.rows.length > 0) {
          await client.query(
            `UPDATE early_access_leads
             SET whatsapp = $1, wants_broadcast_updates = $2, updated_at = $3
             WHERE email = $4`,
            [normalizedWhatsapp, normalizedWantsBroadcastUpdates, now, normalizedEmail]
          );

          res.status(200).json({
            success: true,
            message: 'Você já estava na lista, atualizamos seus dados.',
          });
          return;
        }

        await client.query(
          `INSERT INTO early_access_leads (
            id, email, whatsapp, wants_broadcast_updates, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [uuidv4(), normalizedEmail, normalizedWhatsapp, normalizedWantsBroadcastUpdates, now, now]
        );
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      const existingLead = await db.get('SELECT id FROM early_access_leads WHERE email = ?', [
        normalizedEmail,
      ]);

      if (existingLead) {
        await db.run(
          `UPDATE early_access_leads
           SET whatsapp = ?, wants_broadcast_updates = ?, updated_at = ?
           WHERE email = ?`,
          [normalizedWhatsapp, normalizedWantsBroadcastUpdates, now, normalizedEmail]
        );

        res.status(200).json({
          success: true,
          message: 'Você já estava na lista, atualizamos seus dados.',
        });
        return;
      }

      await db.run(
        `INSERT INTO early_access_leads (
          id, email, whatsapp, wants_broadcast_updates, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), normalizedEmail, normalizedWhatsapp, normalizedWantsBroadcastUpdates, now, now]
      );
    }

    res.status(201).json({
      success: true,
      message: 'Cadastro recebido! Em breve entraremos em contato.',
    });
  } catch (error) {
    console.error('Early access lead error:', error);
    res.status(500).json({ error: 'Falha ao registrar acesso antecipado' });
  }
};
