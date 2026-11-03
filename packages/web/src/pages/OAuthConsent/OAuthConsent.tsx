import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Loading } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import styles from './OAuthConsent.module.css';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export function OAuthConsentPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { token, user, isLoading } = useAuth();
  const [pending, setPending] = useState<'allow' | 'deny' | null>(null);
  const [error, setError] = useState('');

  const clientId = params.get('client_id') || '';
  const redirectUri = params.get('redirect_uri') || '';
  // Name and destination come from the client's registration, never from this
  // URL, which anyone can craft (e.g. client_name=Jarvi with their own redirect).
  const [client, setClient] = useState<{ name: string; redirectHost: string } | null>(null);
  const [clientError, setClientError] = useState(false);
  const payload = {
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: params.get('code_challenge') || '',
    code_challenge_method: params.get('code_challenge_method') || 'S256',
    state: params.get('state') || '',
    scope: params.get('scope') || 'tasks',
    resource: params.get('resource') || '',
  };

  useEffect(() => {
    if (!clientId || !redirectUri) return;
    let cancelled = false;
    const query = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri });
    fetch(`${API_URL}/api/oauth/client?${query.toString()}`)
      .then(async (response) => {
        const data = (await response.json()) as { name?: string; redirect_host?: string };
        if (cancelled) return;
        if (!response.ok || !data.name || !data.redirect_host) {
          setClientError(true);
          return;
        }
        setClient({ name: data.name, redirectHost: data.redirect_host });
      })
      .catch(() => {
        if (!cancelled) setClientError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, redirectUri]);

  useEffect(() => {
    if (isLoading || token) return;
    const next = `/oauth/consent?${params.toString()}`;
    navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
  }, [isLoading, token, navigate, params]);

  const missing = !clientId || !redirectUri || !payload.code_challenge || clientError;
  if (isLoading || !token || !user || (!missing && !client)) return <Loading centered size="lg" />;
  const clientName = client?.name ?? 'Um aplicativo';

  const finish = async (decision: 'allow' | 'deny') => {
    setError('');
    setPending(decision);
    try {
      const response = await fetch(`${API_URL}/api/oauth/${decision === 'allow' ? 'approve' : 'deny'}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(decision === 'allow' ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { redirectTo?: string; error_description?: string };
      if (!response.ok || !data.redirectTo) {
        setError(data.error_description || 'Não foi possível concluir a conexão.');
        return;
      }
      window.location.assign(data.redirectTo);
    } catch {
      setError('Não foi possível concluir a conexão.');
    } finally {
      setPending(null);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1 className={styles.title}>Conectar {clientName}</h1>
        {missing ? (
          <p className={styles.body}>Este pedido de conexão está incompleto. Volte ao aplicativo e tente de novo.</p>
        ) : (
          <>
            <p className={styles.body}>
              {clientName} quer ler e alterar as tarefas de {user.name || user.email}. A conversa continua no aplicativo deles.
            </p>
            <p className={styles.body}>
              Ao permitir, o acesso será enviado para <strong>{client?.redirectHost}</strong>. Só continue se
              você reconhece esse endereço.
            </p>
            <p className={styles.body}>
              A conexão não envia WhatsApp, não faz ligação e não usa o modelo da Jarvi.
            </p>
            <div className={styles.actions}>
              <Button
                variant="secondary"
                onClick={() => void finish('deny')}
                disabled={pending !== null}
              >
                Recusar
              </Button>
              <Button
                variant="primary"
                onClick={() => void finish('allow')}
                disabled={pending !== null}
              >
                {pending === 'allow' ? 'Conectando' : 'Permitir'}
              </Button>
            </div>
          </>
        )}
        {error ? <p className={styles.error}>{error}</p> : null}
      </section>
    </main>
  );
}
