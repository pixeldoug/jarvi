import { useEffect, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { Button, Input } from '../../../components/ui';
import styles from './WhatsAppLink.module.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const WhatsAppLink: React.FC = () => {
  const { token } = useAuth();
  const [phone, setPhone] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [linkedPhone, setLinkedPhone] = useState<string | null>(null);
  const [isLinked, setIsLinked] = useState(false);
  const [isAwaitingCode, setIsAwaitingCode] = useState(false);

  const [requestLoading, setRequestLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [unlinkLoading, setUnlinkLoading] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);

  const clearFeedback = () => {
    setMessage('');
    setError('');
  };

  useEffect(() => {
    let isCancelled = false;

    const loadWhatsappLinkStatus = async () => {
      if (!token) return;
      setStatusLoading(true);

      try {
        const response = await fetch(`${API_URL}/api/users/whatsapp-link`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Erro ao carregar status do WhatsApp');
        }

        if (!isCancelled) {
          const fetchedPhone = typeof data.phone === 'string' ? data.phone : '';
          setLinkedPhone(fetchedPhone || null);
          setPhone(fetchedPhone);
          setIsLinked(Boolean(data.linked));
          setIsAwaitingCode(Boolean(data.awaitingCode));
        }
      } catch (statusError) {
        if (!isCancelled) {
          setError(
            statusError instanceof Error
              ? statusError.message
              : 'Erro ao carregar status do WhatsApp'
          );
        }
      } finally {
        if (!isCancelled) {
          setStatusLoading(false);
        }
      }
    };

    void loadWhatsappLinkStatus();
    return () => {
      isCancelled = true;
    };
  }, [token]);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    setRequestLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/users/whatsapp-link/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ phone }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao enviar código de verificação');
      }

      setMessage(data.message || 'Código enviado com sucesso.');
      setLinkedPhone(data.phone || null);
      setIsAwaitingCode(true);
      setIsLinked(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erro ao enviar código');
    } finally {
      setRequestLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    setVerifyLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/users/whatsapp-link/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: verificationCode }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao validar código');
      }

      setMessage(data.message || 'WhatsApp vinculado com sucesso.');
      setLinkedPhone(data.phone || linkedPhone);
      setVerificationCode('');
      setIsAwaitingCode(false);
      setIsLinked(true);
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : 'Erro ao validar código');
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleUnlink = async () => {
    clearFeedback();
    setUnlinkLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/users/whatsapp-link`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao desvincular WhatsApp');
      }

      setMessage(data.message || 'WhatsApp desvinculado com sucesso.');
      setLinkedPhone(null);
      setVerificationCode('');
      setIsAwaitingCode(false);
      setIsLinked(false);
    } catch (unlinkError) {
      setError(unlinkError instanceof Error ? unlinkError.message : 'Erro ao desvincular WhatsApp');
    } finally {
      setUnlinkLoading(false);
    }
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>Integração com WhatsApp</h2>
      <p className={styles.description}>
        Vincule seu número para criar tarefas pelo WhatsApp com texto, áudio ou imagem.
      </p>

      <div className={styles.infoBox}>
        No sandbox do Twilio, envie primeiro a mensagem de <strong>join</strong> para ativar o número.
      </div>

      {statusLoading && <div className={styles.infoBox}>Carregando status do WhatsApp...</div>}

      {linkedPhone && (
        <div className={styles.currentInfo}>
          <span className={styles.currentInfoLabel}>Número atual:</span>
          <span className={styles.currentInfoValue}>{linkedPhone}</span>
          {isLinked && <span className={styles.linkedBadge}>Vinculado</span>}
        </div>
      )}

      {message && <div className={styles.success}>{message}</div>}
      {error && <div className={styles.error}>{error}</div>}

      <form className={styles.form} onSubmit={handleRequestCode}>
        <Input
          id="whatsappPhone"
          name="whatsappPhone"
          type="tel"
          label="Número do WhatsApp"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+5511999999999"
          helperText="Use DDI + DDD + número"
        />

        <div className={styles.actions}>
          <Button
            type="submit"
            variant="secondary"
            disabled={requestLoading}
            loading={requestLoading}
          >
            Enviar código
          </Button>
        </div>
      </form>

      {isAwaitingCode && (
        <form className={styles.form} onSubmit={handleVerifyCode}>
          <Input
            id="whatsappCode"
            name="whatsappCode"
            type="text"
            label="Código de verificação"
            required
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value)}
            placeholder="Digite o código de 6 dígitos"
          />

          <div className={styles.actions}>
            <Button
              type="submit"
              variant="primary"
              disabled={verifyLoading}
              loading={verifyLoading}
            >
              Verificar código
            </Button>
          </div>
        </form>
      )}

      {isLinked && (
        <div className={styles.actions}>
          <Button
            variant="destructive"
            onClick={handleUnlink}
            disabled={unlinkLoading}
            loading={unlinkLoading}
          >
            Desvincular número
          </Button>
        </div>
      )}
    </section>
  );
};
