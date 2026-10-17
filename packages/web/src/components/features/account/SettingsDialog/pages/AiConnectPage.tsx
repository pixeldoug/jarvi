import { useEffect, useState } from 'react';
import { ArrowLeft, Plugs } from '@phosphor-icons/react';
import { Button, Input, ListCard, ListCardGroup } from '../../../../ui';
import { useAuth } from '../../../../../contexts/AuthContext';
import styles from './AppsPage.module.css';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

interface PersonalToken {
  id: string;
  name: string;
  createdAt: string;
}

interface ConnectedClient {
  client_id: string;
  client_name: string | null;
  connected_at: string;
}

interface McpStatus {
  mcpUrl: string;
  tokens: PersonalToken[];
  clients: ConnectedClient[];
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error_description: text };
  }
}

export function AiConnectPage({ onBack }: { onBack: () => void }) {
  const { token } = useAuth();
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [name, setName] = useState('');
  const [freshToken, setFreshToken] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);

  const load = async () => {
    if (!token) return;
    const response = await fetch(`${API_URL}/api/mcp/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await readJson(response);
    if (!response.ok) {
      setError(typeof data.error_description === 'string' ? data.error_description : 'Não foi possível carregar a conexão.');
      return;
    }
    setStatus({
      mcpUrl: typeof data.mcpUrl === 'string' ? data.mcpUrl : '',
      tokens: Array.isArray(data.tokens) ? (data.tokens as PersonalToken[]) : [],
      clients: Array.isArray(data.clients) ? (data.clients as ConnectedClient[]) : [],
    });
  };

  useEffect(() => {
    void load();
    // Status is loaded once per open, and again after each mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const copy = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(message);
      setError('');
    } catch {
      setError('Não foi possível copiar.');
    }
  };

  const createToken = async () => {
    if (!token) return;
    setCreating(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${API_URL}/api/mcp/tokens`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      });
      const data = await readJson(response);
      if (!response.ok || typeof data.token !== 'string') {
        setError(typeof data.error_description === 'string' ? data.error_description : 'Não foi possível criar a chave.');
        return;
      }
      setFreshToken(data.token);
      setName('');
      await load();
    } catch {
      setError('Não foi possível criar a chave.');
    } finally {
      setCreating(false);
    }
  };

  const revokeToken = async (id: string) => {
    if (!token) return;
    setError('');
    const response = await fetch(`${API_URL}/api/mcp/tokens/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      setError('Não foi possível revogar a chave.');
      return;
    }
    if (freshToken) setFreshToken('');
    await load();
  };

  const disconnect = async (clientId: string) => {
    if (!token) return;
    setError('');
    const response = await fetch(`${API_URL}/api/mcp/clients/revoke`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ clientId }),
    });
    if (!response.ok) {
      setError('Não foi possível desconectar.');
      return;
    }
    await load();
  };

  const mcpUrl = status?.mcpUrl || '';

  return (
    <div className={styles.subPageWrapper}>
      <button type="button" className={styles.backLink} onClick={onBack}>
        <ArrowLeft size={16} />
        Apps
      </button>

      <div className={styles.subPageAppHeader}>
        <span className={styles.iconContainer}>
          <Plugs size={24} />
        </span>
        <h1 className={styles.subPageAppName}>Assistentes de IA</h1>
      </div>

      <p className={styles.note}>
        Conecte o ChatGPT, o Claude ou outro app compatível para ler e alterar suas tarefas. A conversa fica no app deles.
      </p>

      <div className={styles.formSection}>
        <p className={styles.fieldLabel}>Endereço</p>
        <div className={`${styles.inputRow} ${styles.urlRow}`}>
          <p className={styles.tokenValue}>{mcpUrl || 'Carregando endereço'}</p>
          <Button
            variant="secondary"
            size="small"
            disabled={!mcpUrl}
            onClick={() => void copy(mcpUrl, 'Endereço copiado.')}
          >
            Copiar
          </Button>
        </div>
        <ol className={styles.steps}>
          <li>No ChatGPT, abra Configurações, depois Conectores, e adicione este endereço.</li>
          <li>No Claude, abra Configurações, depois Conectores, e use o mesmo endereço.</li>
          <li>Na primeira vez, a Jarvi pede para você entrar e permitir o acesso às tarefas.</li>
        </ol>
      </div>

      {status && status.clients.length > 0 ? (
        <div className={styles.formSection}>
          <h2 className={styles.sectionTitle}>Conectados</h2>
          <ListCardGroup>
            {status.clients.map((client) => (
              <ListCard
                key={client.client_id}
                as="li"
                icon={<Plugs size={24} />}
                title={client.client_name || 'Aplicativo'}
                description="Pode ler e alterar suas tarefas."
                action={
                  <Button variant="secondary" size="small" onClick={() => void disconnect(client.client_id)}>
                    Desconectar
                  </Button>
                }
              />
            ))}
          </ListCardGroup>
        </div>
      ) : null}

      <div className={styles.formSection}>
        <h2 className={styles.sectionTitle}>Chave para apps sem login</h2>
        <p className={styles.note}>
          Use uma chave só se o app pedir um token no lugar do login. Ela aparece uma vez.
        </p>
        <div className={styles.inputRow}>
          <Input
            id="jarvi-mcp-key-name"
            value={name}
            placeholder="Nome da chave"
            onChange={(event) => setName(event.target.value)}
          />
          <Button variant="primary" size="small" disabled={creating} onClick={() => void createToken()}>
            {creating ? 'Criando' : 'Criar'}
          </Button>
        </div>
        {freshToken ? (
          <div className={styles.formSection}>
            <p className={styles.tokenValue}>{freshToken}</p>
            <Button variant="secondary" size="small" onClick={() => void copy(freshToken, 'Chave copiada.')}>
              Copiar chave
            </Button>
          </div>
        ) : null}
        {status && status.tokens.length > 0 ? (
          <ListCardGroup>
            {status.tokens.map((item) => (
              <ListCard
                key={item.id}
                as="li"
                icon={<Plugs size={24} />}
                title={item.name}
                description={`Criada em ${new Date(item.createdAt).toLocaleDateString('pt-BR')}`}
                action={
                  <Button variant="secondary" size="small" onClick={() => void revokeToken(item.id)}>
                    Revogar
                  </Button>
                }
              />
            ))}
          </ListCardGroup>
        ) : null}
      </div>

      {error ? <p className={styles.feedbackError}>{error}</p> : null}
      {notice ? <p className={styles.feedbackSuccess}>{notice}</p> : null}
    </div>
  );
}
