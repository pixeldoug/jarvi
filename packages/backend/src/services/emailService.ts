import { Resend } from 'resend';
import { generateOtpFromToken } from '../utils/otp';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = 'Jarvi <hello@jarvi.life>';
const APP_URL =
  process.env.APP_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://app.jarvi.life'
    : 'http://localhost:5173');
const EMAIL_LOGO_CID = 'jarvi-logo-inline';
const EMAIL_LOGO_PNG_BASE64 =
  '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';

function getInlineLogoAttachment() {
  return {
    filename: 'jarvi-logo.png',
    content: EMAIL_LOGO_PNG_BASE64,
    contentType: 'image/png',
    contentId: EMAIL_LOGO_CID,
  };
}

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
                  <img src="cid:${EMAIL_LOGO_CID}" alt="Jarvi" width="34" height="34" style="display:block;" />
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
      attachments: [getInlineLogoAttachment()],
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
      attachments: [getInlineLogoAttachment()],
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
      attachments: [getInlineLogoAttachment()],
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
      attachments: [getInlineLogoAttachment()],
    });
    console.log(`✉️ Google account notice email sent to ${email}`);
  } catch (error) {
    console.error('Failed to send Google account notice email:', error);
    throw new Error('Failed to send Google account notice email');
  }
};
