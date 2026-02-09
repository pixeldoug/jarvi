import { Resend } from 'resend';
import { generateOtpFromToken } from '../utils/otp';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = 'Jarvi <hello@jarvi.life>';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

// ============================================================================
// Email templates (simple, unified layout)
// ============================================================================

const COLORS = {
  bg: '#F7F8F9',
  surface: '#FFFFFF',
  border: '#D8DDE0',
  text: '#34373C',
  textMuted: '#757F88',
  textSubtle: '#A0ABB4',
  brandA: '#7048F5',
  brandB: '#4F26E4',
  danger: '#DC2626',
} as const;

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderEmailShell(params: {
  title: string;
  preheader?: string;
  contentHtml: string;
}): string {
  const title = escapeHtml(params.title);
  const preheader = params.preheader ? escapeHtml(params.preheader) : '';

  // Logo SVG base64 (Jarvi icon)
  const logoSvg = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjMiIHZpZXdCb3g9IjAgMCAyMCAyMyIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEwIDIzQzE1LjUyMjggMjMgMjAgMTguMzIyIDIwIDEyLjVDMjAgNi42NzggMTUuNTIyOCAyIDEwIDJDNC40NzcyIDIgMCA2LjY3OCAwIDEyLjVDMCAxOC4zMjIgNC40NzcyIDIzIDEwIDIzWiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTEwIDIwQzEzLjg2NiAyMCAxNyAxNi42MzcgMTcgMTIuNUMxNyA4LjM2MyAxMy44NjYgNSAxMCA1QzYuMTM0MDEgNSAzIDguMzYzIDMgMTIuNUMzIDE2LjYzNyA2LjEzNDAxIDIwIDEwIDIwWiIgZmlsbD0id2hpdGUiLz4KPC9zdmc+Cg==';

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${title}</title>
  </head>
  <body style="margin:0; padding:0; background-color:${COLORS.bg};">
    ${preheader ? `
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent; mso-hide:all;">
      ${preheader}
    </div>` : ''}

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${COLORS.bg};">
      <tr>
        <td align="center" style="padding:64px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:612px; position:relative;">
            <tr>
              <td style="position:relative; border-radius:24px; box-shadow:0px 1px 2px 0px rgba(9,9,11,0.05); background:linear-gradient(155.09deg, rgb(255,255,255) 5.96%, rgb(255,255,255) 74.58%, rgba(255,255,255,0.8) 93.94%);">
                <!-- Logo no canto superior esquerdo -->
                <div style="position:absolute; left:27px; top:24px; width:48px; height:48px; background:#18181B; border-radius:16px; border-bottom:2px solid rgba(9,9,11,0.3); box-shadow:0px 1px 0px 0px rgba(24,24,27,0.15); display:flex; align-items:center; justify-content:center;">
                  <img src="${logoSvg}" alt="Jarvi" width="20" height="23" style="display:block;" />
                </div>
                
                <!-- Conteúdo do email -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td style="padding:40px; padding-top:96px; padding-bottom:48px; font-family:${FONT_STACK}; color:${COLORS.text};">
                      <div style="max-width:404px; margin:0 auto;">
                        ${params.contentHtml}
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderPrimaryButton(label: string, href: string): string {
  const safeLabel = escapeHtml(label);
  const safeHref = escapeHtml(href);

  // Bulletproof-ish button (works well across major clients)
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
    <tr>
      <td align="center" bgcolor="${COLORS.brandB}" style="border-radius:16px; background:${COLORS.brandB}; background-image:linear-gradient(135deg, ${COLORS.brandA} 0%, ${COLORS.brandB} 100%);">
        <a href="${safeHref}"
           style="display:inline-block; padding:14px 22px; font-family:${FONT_STACK}; font-size:15px; font-weight:600; line-height:18px; color:#FFFFFF; text-decoration:none; border-radius:16px;">
          ${safeLabel}
        </a>
      </td>
    </tr>
  </table>`;
}

function renderDivider(): string {
  return `<div style="height:1px; background-color:${COLORS.border}; margin:28px 0;"></div>`;
}

function renderParagraph(text: string): string {
  return `<p style="margin:0 0 16px; font-family:'Poppins', ${FONT_STACK}; font-size:15px; font-weight:400; line-height:22px; color:${COLORS.text};">${text}</p>`;
}

function renderTitle(text: string): string {
  return `<h2 style="margin:0 0 16px; font-family:'Poppins', ${FONT_STACK}; font-size:32px; font-weight:600; line-height:32px; color:${COLORS.text};">${text}</h2>`;
}

function renderSmall(text: string): string {
  return `<p style="margin:0; font-family:'Poppins', ${FONT_STACK}; font-size:15px; font-weight:400; line-height:22px; color:${COLORS.text};">${text}</p>`;
}

const getVerificationEmailHtml = (name: string, otpCode: string): string => {
  const safeName = escapeHtml(name || ''); // name comes from user input
  const safeOtp = escapeHtml(otpCode);

  const contentHtml = `
    ${renderTitle('Confirme sua conta')}
    ${renderParagraph(`Olá, ${safeName}! Para começar a usar o app, confirme seu e-mail com o código abaixo.`)}

    <div style="text-align:center; margin:24px 0;">
      <div style="display:inline-block; padding:24px 40px; border-radius:16px; border:1px solid ${COLORS.border}; background:${COLORS.bg}; box-shadow:0px 1px 2px 0px rgba(9,9,11,0.05);">
        <span style="font-family:${FONT_STACK}; font-size:32px; font-weight:600; line-height:32px; letter-spacing:2px; color:${COLORS.text};">
          ${safeOtp}
        </span>
      </div>
    </div>

    ${renderSmall('Este código expira em 24 horas. Se você não criou uma conta na Jarvi, ignore este email.')}
  `;

  return renderEmailShell({
    title: 'Verifique seu email',
    preheader: 'Seu código de verificação do Jarvi',
    contentHtml,
  });
};

const getPasswordResetEmailHtml = (name: string, resetUrl: string): string => {
  const safeName = escapeHtml(name || '');
  const displayResetUrl = escapeHtml(resetUrl);

  const contentHtml = `
    ${renderTitle(`Olá, ${safeName}!`)}
    ${renderParagraph('Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha:')}
    <div style="margin:22px 0 18px; text-align:center;">
      ${renderPrimaryButton('Redefinir senha', resetUrl)}
    </div>
    ${renderSmall('Se o botão não funcionar, copie e cole este link no seu navegador:')}
    <p style="margin:10px 0 0; font-family:${FONT_STACK}; font-size:13px; line-height:20px; color:${COLORS.brandB}; word-break:break-all;">
      ${displayResetUrl}
    </p>
    ${renderDivider()}
    ${renderSmall('Este link expira em 1 hora. Se você não solicitou a redefinição de senha, ignore este email.')}
  `;

  return renderEmailShell({
    title: 'Redefinir sua senha',
    preheader: 'Link para redefinição de senha do Jarvi',
    contentHtml,
  });
};

const getEmailChangeConfirmationHtml = (name: string, newEmail: string, verificationUrl: string): string => {
  const safeName = escapeHtml(name || '');
  const safeNewEmail = escapeHtml(newEmail);
  const displayUrl = escapeHtml(verificationUrl);

  const contentHtml = `
    ${renderTitle(`Olá, ${safeName}!`)}
    ${renderParagraph(`Você solicitou a alteração do email da sua conta para <strong style="color:${COLORS.text}; font-weight:700;">${safeNewEmail}</strong>. Clique no botão abaixo para confirmar:`)}
    <div style="margin:22px 0 18px; text-align:center;">
      ${renderPrimaryButton('Confirmar novo email', verificationUrl)}
    </div>
    ${renderSmall('Se o botão não funcionar, copie e cole este link no seu navegador:')}
    <p style="margin:10px 0 0; font-family:${FONT_STACK}; font-size:13px; line-height:20px; color:${COLORS.brandB}; word-break:break-all;">
      ${displayUrl}
    </p>
    ${renderDivider()}
    ${renderSmall('Este link expira em 24 horas. Se você não solicitou essa alteração, ignore este email.')}
  `;

  return renderEmailShell({
    title: 'Confirme seu novo email',
    preheader: 'Confirmação de novo email no Jarvi',
    contentHtml,
  });
};

const getGoogleAccountNoticeEmailHtml = (name: string, loginUrl: string): string => {
  const safeName = escapeHtml(name || '');
  const displayUrl = escapeHtml(loginUrl);

  const contentHtml = `
    ${renderTitle(`Olá, ${safeName}!`)}
    ${renderParagraph('Recebemos uma solicitação de redefinição de senha para sua conta, mas identificamos que <strong style="color:' + COLORS.text + '; font-weight:700;">sua conta foi criada usando o login com Google</strong>.')}
    ${renderParagraph('Para acessar sua conta, use o botão \"Entrar com Google\" na tela de login:')}
    <div style="margin:22px 0 18px; text-align:center;">
      ${renderPrimaryButton('Ir para o login', loginUrl)}
    </div>
    ${renderSmall('Se o botão não funcionar, copie e cole este link no seu navegador:')}
    <p style="margin:10px 0 0; font-family:${FONT_STACK}; font-size:13px; line-height:20px; color:${COLORS.brandB}; word-break:break-all;">
      ${displayUrl}
    </p>
    ${renderDivider()}
    ${renderSmall('Sua senha é gerenciada pelo Google. Se você não solicitou a redefinição de senha, ignore este email e sua conta permanecerá segura.')}
  `;

  return renderEmailShell({
    title: 'Sua conta Jarvi - Acesso com Google',
    preheader: 'Acesso com Google no Jarvi',
    contentHtml,
  });
};

export const sendVerificationEmail = async (
  email: string,
  name: string,
  token: string
): Promise<void> => {
  const otpCode = generateOtpFromToken(token);

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Verifique seu email - Jarvi',
      html: getVerificationEmailHtml(name, otpCode),
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

export const sendGoogleAccountNoticeEmail = async (
  email: string,
  name: string
): Promise<void> => {
  const loginUrl = `${APP_URL}/login`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Sua conta Jarvi - Acesso com Google',
      html: getGoogleAccountNoticeEmailHtml(name, loginUrl),
    });
    console.log(`✉️ Google account notice email sent to ${email}`);
  } catch (error) {
    console.error('Failed to send Google account notice email:', error);
    throw new Error('Failed to send Google account notice email');
  }
};
