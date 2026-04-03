/**
 * AppsPage - SettingsDialog
 *
 * Apps tab: integrations list + per-app connection sub-pages.
 * Currently only WhatsApp is available; all other apps show "Em breve".
 *
 * Figma: https://figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-App
 * Nodes: 40001300-917 (list), 40001302-3829 / 40001305-4219 / 40001305-4296 (WA flow)
 */

import { useEffect, useState } from 'react';
import { ArrowLeft } from '@phosphor-icons/react';
import { Button, Input } from '../../../../ui';
import { useAuth } from '../../../../../contexts/AuthContext';
import styles from './AppsPage.module.css';

// ============================================================================
// CONSTANTS
// ============================================================================

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface AppDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  available: boolean;
}

const APPS: AppDefinition[] = [
  {
    id: 'whatsapp',
    name: 'Whatsapp',
    description:
      'Transforme mensagens em tarefas automaticamente. Envie textos, áudios ou arquivos e a Jarvi organiza tudo para você.',
    icon: '/icons/apps/whatsapp.svg',
    available: true,
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description:
      'Transforme e-mails em tarefas acionáveis. Centralize suas demandas e nunca perca um follow-up importante.',
    icon: '/icons/apps/gmail.svg',
    available: false,
  },
  {
    id: 'outlook-mail',
    name: 'Outlook Mail',
    description:
      'Converta e-mails em tarefas com contexto. A Jarvi entende suas mensagens e organiza suas prioridades.',
    icon: '/icons/apps/outlook.svg',
    available: false,
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description:
      'Conecte sua agenda para transformar compromissos em tarefas e manter tudo sincronizado com sua rotina.',
    icon: '/icons/apps/google-calendar.svg',
    available: false,
  },
  {
    id: 'outlook-calendar',
    name: 'Outlook Calendar',
    description:
      'Reúna os eventos do seu calendário do Outlook e as tarefas para um planejamento mais claro e melhor gerenciamento do tempo.',
    icon: '/icons/apps/outlook.svg',
    available: false,
  },
  {
    id: 'alexa',
    name: 'Alexa',
    description:
      'Crie tarefas por comando de voz. Basta falar com a Alexa e a Jarvi cuida do resto.',
    icon: '/icons/apps/alexa.svg',
    available: false,
  },
  {
    id: 'siri',
    name: 'Siri',
    description:
      'Transforme mensagens em tarefas automaticamente. Envie textos, áudios ou arquivos e a Jarvi organiza tudo para você.',
    icon: '/icons/apps/siri.png',
    available: false,
  },
];

// ============================================================================
// HELPERS
// ============================================================================

const parseApiPayload = async (response: Response): Promise<Record<string, unknown>> => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json() as Promise<Record<string, unknown>>;
  }
  const rawText = await response.text();
  if (!rawText) return {};
  try {
    return JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    return { error: rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() };
  }
};

// ============================================================================
// ROOT: VIEW CONTROLLER
// ============================================================================

type AppsView = 'list' | 'whatsapp';

export function AppsPage() {
  const [view, setView] = useState<AppsView>('list');

  if (view === 'list') {
    return <AppsList onConnect={() => setView('whatsapp')} />;
  }
  return <WhatsAppConnectPage onBack={() => setView('list')} />;
}

// ============================================================================
// APPS LIST VIEW
// ============================================================================

interface AppsListProps {
  onConnect: () => void;
}

function AppsList({ onConnect }: AppsListProps) {
  return (
    <>
      <div className={styles.listHeader}>
        <h1 className={styles.pageTitle}>Apps</h1>
        <p className={styles.pageSubtitle}>Gerencie os aplicativos conectados à sua conta.</p>
      </div>

      <ul className={styles.integrationList}>
        {APPS.map((app) => (
          <li key={app.id} className={styles.integrationRow}>
            <div className={styles.integrationInfo}>
              <div className={styles.iconContainer}>
                <img
                  src={app.icon}
                  alt={app.name}
                  className={styles.appIcon}
                  draggable={false}
                />
              </div>
              <div className={styles.integrationDetails}>
                <p className={styles.integrationName}>{app.name}</p>
                <p className={styles.integrationDescription}>{app.description}</p>
              </div>
            </div>

            <div className={styles.integrationActions}>
              {app.available ? (
                <Button variant="secondary" size="small" onClick={onConnect}>
                  Conectar
                </Button>
              ) : (
                <span className={styles.comingSoonPill} aria-disabled="true">
                  Em breve
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

// ============================================================================
// WHATSAPP CONNECTION SUB-PAGE
// ============================================================================

type WhatsAppState = 'initial' | 'awaitingCode' | 'connected';

interface WhatsAppConnectPageProps {
  onBack: () => void;
}

function WhatsAppConnectPage({ onBack }: WhatsAppConnectPageProps) {
  const { token } = useAuth();

  const [whatsappState, setWhatsappState] = useState<WhatsAppState>('initial');
  const [phone, setPhone] = useState('');
  const [linkedPhone, setLinkedPhone] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');

  const [statusLoading, setStatusLoading] = useState(false);
  const [requestLoading, setRequestLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [unlinkLoading, setUnlinkLoading] = useState(false);

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const clearFeedback = () => {
    setError('');
    setSuccessMsg('');
  };

  // Load current WhatsApp link status on mount
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const load = async () => {
      setStatusLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/users/whatsapp-link`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await parseApiPayload(res);
        if (!res.ok) return;
        if (cancelled) return;

        const fetchedPhone = typeof data.phone === 'string' ? data.phone : '';
        setLinkedPhone(fetchedPhone || null);
        setPhone(fetchedPhone);

        if (data.linked) {
          setWhatsappState('connected');
        } else if (data.awaitingCode) {
          setWhatsappState('awaitingCode');
        } else {
          setWhatsappState('initial');
        }
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Send verification code
  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    setRequestLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/users/whatsapp-link/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ phone }),
      });
      const data = await parseApiPayload(res);
      if (!res.ok) throw new Error(String(data.error || 'Erro ao enviar código de verificação'));

      setSuccessMsg(String(data.message || 'Código enviado com sucesso.'));
      setLinkedPhone(typeof data.phone === 'string' ? data.phone : phone);
      setWhatsappState('awaitingCode');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar código');
    } finally {
      setRequestLoading(false);
    }
  };

  // Resend verification code
  const handleResendCode = async () => {
    clearFeedback();
    setRequestLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/users/whatsapp-link/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ phone }),
      });
      const data = await parseApiPayload(res);
      if (!res.ok) throw new Error(String(data.error || 'Erro ao reenviar código'));
      setSuccessMsg(String(data.message || 'Código reenviado com sucesso.'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao reenviar código');
    } finally {
      setRequestLoading(false);
    }
  };

  // Confirm verification code
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    setVerifyLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/users/whatsapp-link/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: verificationCode }),
      });
      const data = await parseApiPayload(res);
      if (!res.ok) throw new Error(String(data.error || 'Erro ao validar código'));

      setSuccessMsg(String(data.message || 'WhatsApp vinculado com sucesso.'));
      setLinkedPhone(typeof data.phone === 'string' ? data.phone : linkedPhone);
      setVerificationCode('');
      setWhatsappState('connected');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao validar código');
    } finally {
      setVerifyLoading(false);
    }
  };

  // Unlink WhatsApp
  const handleUnlink = async () => {
    clearFeedback();
    setUnlinkLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/users/whatsapp-link`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await parseApiPayload(res);
      if (!res.ok) throw new Error(String(data.error || 'Erro ao desvincular WhatsApp'));

      setSuccessMsg(String(data.message || 'WhatsApp desvinculado com sucesso.'));
      setLinkedPhone(null);
      setPhone('');
      setVerificationCode('');
      setWhatsappState('initial');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao desvincular WhatsApp');
    } finally {
      setUnlinkLoading(false);
    }
  };

  return (
    <div className={styles.subPageWrapper}>
      {/* Back navigation */}
      <button type="button" className={styles.backLink} onClick={onBack}>
        <ArrowLeft size={16} weight="regular" />
        Apps
      </button>

      {/* App identity header */}
      <div className={styles.subPageAppHeader}>
        <div className={styles.iconContainer}>
          <img
            src="/icons/apps/whatsapp.svg"
            alt="WhatsApp"
            className={styles.appIcon}
            draggable={false}
          />
        </div>
        <h1 className={styles.subPageAppName}>Whatsapp</h1>
      </div>

      <p className={styles.pageSubtitle}>Gerencie os aplicativos conectados à sua conta.</p>

      {/* Feedback */}
      {statusLoading && <p className={styles.pageSubtitle}>Carregando...</p>}
      {error && <p className={styles.feedbackError}>{error}</p>}
      {successMsg && <p className={styles.feedbackSuccess}>{successMsg}</p>}

      {/* ── INITIAL STATE ─────────────────────────────────────────── */}
      {whatsappState === 'initial' && (
        <form className={styles.formSection} onSubmit={handleRequestCode}>
          <div>
            <label className={styles.fieldLabel} htmlFor="wa-phone-initial">
              Número do WhatsApp
            </label>
            <div className={styles.inputRow}>
              <Input
                id="wa-phone-initial"
                name="phone"
                type="tel"
                placeholder="+551199999999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                showLabel={false}
                required
              />
              <Button
                type="submit"
                variant="primary"
                loading={requestLoading}
                disabled={requestLoading}
              >
                Enviar Código
              </Button>
            </div>
            <p className={styles.helperText}>Use DDI + DDD + número</p>
          </div>
        </form>
      )}

      {/* ── AWAITING CODE STATE ────────────────────────────────────── */}
      {whatsappState === 'awaitingCode' && (
        <form className={styles.formSection} onSubmit={handleVerifyCode}>
          <div>
            <label className={styles.fieldLabel} htmlFor="wa-phone-await">
              Número do WhatsApp
            </label>
            <div className={styles.inputRow}>
              <Input
                id="wa-phone-await"
                name="phone"
                type="tel"
                placeholder="+551199999999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                showLabel={false}
              />
              <Button
                type="button"
                variant="secondary"
                loading={requestLoading}
                disabled={requestLoading}
                onClick={handleResendCode}
              >
                Renviar Código
              </Button>
            </div>
          </div>

          <div>
            <label className={styles.fieldLabel} htmlFor="wa-code">
              Código de verificação
            </label>
            <div className={styles.inputRow}>
              <Input
                id="wa-code"
                name="code"
                type="text"
                placeholder="Digite o código de 6 dígitos"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                showLabel={false}
                required
              />
              <Button
                type="submit"
                variant="primary"
                loading={verifyLoading}
                disabled={verifyLoading}
              >
                Confirmar
              </Button>
            </div>
            <p className={styles.helperText}>Use DDI + DDD + número</p>
          </div>
        </form>
      )}

      {/* ── CONNECTED STATE ────────────────────────────────────────── */}
      {whatsappState === 'connected' && (
        <div className={styles.formSection}>
          <div className={styles.connectedRow}>
            <span className={styles.connectedBadge}>Conectado</span>
            <p className={styles.connectedPhone}>{linkedPhone}</p>
            <div className={styles.connectedActions}>
              <Button
                variant="secondary"
                loading={unlinkLoading}
                disabled={unlinkLoading}
                onClick={handleUnlink}
              >
                Desvincular número
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
