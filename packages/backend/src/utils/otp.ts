import crypto from 'crypto';

/**
 * Deriva um código OTP numérico (6 dígitos) a partir de um token longo.
 * - Não precisa armazenar o OTP no banco: basta armazenar o token e derivar.
 * - Segurança depende do token ser aleatório e do endpoint ter rate-limit.
 */
export function generateOtpFromToken(token: string): string {
  const hashHex = crypto.createHash('sha256').update(token).digest('hex');
  // Usa 32 bits do hash para gerar um número e reduz para 6 dígitos.
  const n = parseInt(hashHex.slice(0, 8), 16) % 1_000_000;
  return String(n).padStart(6, '0');
}

