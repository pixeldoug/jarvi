import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = 'Jarvi <hello@jarvi.life>';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

// Email templates
const getVerificationEmailHtml = (name: string, verificationUrl: string): string => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verifique seu email</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Jarvi</h1>
  </div>
  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
    <h2 style="color: #1f2937; margin-top: 0;">Olá, ${name}!</h2>
    <p style="color: #4b5563;">Obrigado por criar sua conta no Jarvi. Para começar a usar o app, confirme seu email clicando no botão abaixo:</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${verificationUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Verificar Email</a>
    </div>
    <p style="color: #6b7280; font-size: 14px;">Se o botão não funcionar, copie e cole este link no seu navegador:</p>
    <p style="color: #667eea; font-size: 14px; word-break: break-all;">${verificationUrl}</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    <p style="color: #9ca3af; font-size: 12px; margin-bottom: 0;">Este link expira em 24 horas. Se você não criou uma conta no Jarvi, ignore este email.</p>
  </div>
</body>
</html>
`;

const getPasswordResetEmailHtml = (name: string, resetUrl: string): string => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Redefinir sua senha</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Jarvi</h1>
  </div>
  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
    <h2 style="color: #1f2937; margin-top: 0;">Olá, ${name}!</h2>
    <p style="color: #4b5563;">Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha:</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Redefinir Senha</a>
    </div>
    <p style="color: #6b7280; font-size: 14px;">Se o botão não funcionar, copie e cole este link no seu navegador:</p>
    <p style="color: #667eea; font-size: 14px; word-break: break-all;">${resetUrl}</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    <p style="color: #9ca3af; font-size: 12px; margin-bottom: 0;">Este link expira em 1 hora. Se você não solicitou a redefinição de senha, ignore este email.</p>
  </div>
</body>
</html>
`;

const getEmailChangeConfirmationHtml = (name: string, newEmail: string, verificationUrl: string): string => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirme seu novo email</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Jarvi</h1>
  </div>
  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
    <h2 style="color: #1f2937; margin-top: 0;">Olá, ${name}!</h2>
    <p style="color: #4b5563;">Você solicitou a alteração do email da sua conta para <strong>${newEmail}</strong>. Clique no botão abaixo para confirmar:</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${verificationUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Confirmar Novo Email</a>
    </div>
    <p style="color: #6b7280; font-size: 14px;">Se o botão não funcionar, copie e cole este link no seu navegador:</p>
    <p style="color: #667eea; font-size: 14px; word-break: break-all;">${verificationUrl}</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    <p style="color: #9ca3af; font-size: 12px; margin-bottom: 0;">Este link expira em 24 horas. Se você não solicitou essa alteração, ignore este email.</p>
  </div>
</body>
</html>
`;

export const sendVerificationEmail = async (
  email: string,
  name: string,
  token: string
): Promise<void> => {
  const verificationUrl = `${APP_URL}/verify-email?token=${token}`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Verifique seu email - Jarvi',
      html: getVerificationEmailHtml(name, verificationUrl),
    });
    console.log(`✉️ Verification email sent to ${email}`);
  } catch (error) {
    console.error('Failed to send verification email:', error);
    throw new Error('Failed to send verification email');
  }
};

export const sendPasswordResetEmail = async (
  email: string,
  name: string,
  token: string
): Promise<void> => {
  const resetUrl = `${APP_URL}/reset-password?token=${token}`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Redefinir sua senha - Jarvi',
      html: getPasswordResetEmailHtml(name, resetUrl),
    });
    console.log(`✉️ Password reset email sent to ${email}`);
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    throw new Error('Failed to send password reset email');
  }
};

export const sendEmailChangeConfirmation = async (
  newEmail: string,
  name: string,
  token: string
): Promise<void> => {
  const verificationUrl = `${APP_URL}/verify-email?token=${token}&type=email-change`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: newEmail,
      subject: 'Confirme seu novo email - Jarvi',
      html: getEmailChangeConfirmationHtml(name, newEmail, verificationUrl),
    });
    console.log(`✉️ Email change confirmation sent to ${newEmail}`);
  } catch (error) {
    console.error('Failed to send email change confirmation:', error);
    throw new Error('Failed to send email change confirmation');
  }
};
