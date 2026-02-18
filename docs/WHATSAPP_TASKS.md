# Plano de Implementação: Criação de Tarefas via WhatsApp

## Visão Geral

Permitir que usuários enviem mensagens de texto ou áudio para um número WhatsApp
da Jarvi e, a partir disso, a IA sugira a criação de uma tarefa. O usuário confirma
pelo próprio WhatsApp ou pela plataforma web.

**Fluxo resumido:**

```
Mensagem WhatsApp → Webhook → AI (transcrição + extração) → Pending Task
→ Confirmação (WhatsApp ou Web) → Tarefa criada
```

---

## Stack de Implementação

| Camada | Tecnologia |
|---|---|
| WhatsApp API | Meta WhatsApp Cloud API (gratuita) |
| Transcrição de áudio | OpenAI Whisper (`whisper-1`) |
| Extração de tarefa | OpenAI GPT-4o-mini |
| Fila assíncrona | BullMQ + Redis (Redis já está no docker-compose) |
| Real-time frontend | Socket.io (já em uso) |
| Backend | Express + TypeScript (já existente) |
| DB | SQLite (dev) / PostgreSQL (prod) (já existente) |

---

## Arquitetura de Arquivos

### Novos arquivos no backend

```
packages/backend/src/
├── services/
│   ├── openaiService.ts              ← Whisper (STT) + GPT-4o-mini (extração)
│   └── whatsappService.ts            ← Envio de mensagens via Meta Cloud API
├── controllers/
│   ├── whatsappWebhookController.ts  ← Processa mensagens recebidas
│   └── pendingTaskController.ts      ← CRUD de pending tasks
├── routes/
│   ├── whatsappRoutes.ts             ← GET/POST /api/webhooks/whatsapp
│   └── pendingTaskRoutes.ts          ← /api/pending-tasks
├── queues/
│   └── whatsappQueue.ts              ← Fila BullMQ para processar mensagens
└── database/
    └── migrations/
        ├── add_whatsapp_phone_to_users.ts
        └── create_pending_tasks.ts
```

### Novos arquivos no frontend (web)

```
packages/web/src/
├── components/
│   └── PendingTasks/
│       ├── PendingTaskCard.tsx         ← Card com preview + botões Confirmar/Rejeitar/Editar
│       └── PendingTaskCard.module.css
├── hooks/
│   └── usePendingTasks.ts             ← Fetch + Socket.io listener
└── pages/
    └── Settings/
        └── WhatsAppLink/
            ├── WhatsAppLink.tsx       ← UI para vincular número
            └── WhatsAppLink.module.css
```

---

## Banco de Dados

### 1. Alterar tabela `users`

```sql
ALTER TABLE users ADD COLUMN whatsapp_phone TEXT UNIQUE;
ALTER TABLE users ADD COLUMN whatsapp_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN whatsapp_link_code TEXT;
ALTER TABLE users ADD COLUMN whatsapp_link_code_expires_at TIMESTAMP;
```

### 2. Nova tabela `pending_tasks`

```sql
CREATE TABLE pending_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source TEXT DEFAULT 'whatsapp',
  raw_content TEXT,
  transcription TEXT,
  suggested_title TEXT NOT NULL,
  suggested_description TEXT,
  suggested_priority TEXT,
  suggested_due_date TIMESTAMP,
  suggested_time TEXT,
  suggested_category TEXT,
  status TEXT DEFAULT 'awaiting_confirmation',
  -- 'awaiting_confirmation' | 'confirmed' | 'rejected' | 'expired'
  whatsapp_message_id TEXT,
  whatsapp_phone TEXT,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## Endpoints da API

### Webhook WhatsApp

```
GET  /api/webhooks/whatsapp
     → Verificação do webhook pela Meta (hub.challenge)
     → Sem autenticação JWT

POST /api/webhooks/whatsapp
     → Recebe eventos do WhatsApp
     → Valida assinatura X-Hub-Signature-256
     → Sem autenticação JWT
     → Enfileira mensagem no BullMQ
```

### Pending Tasks

```
GET    /api/pending-tasks              → Lista pending tasks do usuário (status = awaiting_confirmation)
POST   /api/pending-tasks/:id/confirm  → Confirma → cria task real → remove pending
POST   /api/pending-tasks/:id/reject   → Rejeita → status = rejected
PUT    /api/pending-tasks/:id          → Edita campos sugeridos antes de confirmar
DELETE /api/pending-tasks/:id          → Remove
```

### Vinculação WhatsApp

```
POST   /api/users/whatsapp-link/request  → Gera código de 6 dígitos, envia via WhatsApp
POST   /api/users/whatsapp-link/verify   → Usuário insere código na plataforma → vincula número
DELETE /api/users/whatsapp-link          → Remove vinculação
```

---

## Serviços de AI

### `openaiService.ts`

```typescript
// packages/backend/src/services/openaiService.ts

import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Transcreve áudio (arquivo OGG/Opus do WhatsApp → texto)
export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  const file = new File([audioBuffer], 'audio.ogg', { type: mimeType });
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'pt',
  });
  return transcription.text;
}

// Extrai campos da tarefa a partir do texto
export async function extractTaskFromText(text: string): Promise<ExtractedTask> {
  const today = new Date().toISOString();
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Você é um assistente que extrai informações de tarefas a partir de mensagens
em português. Retorne SEMPRE um JSON válido com os campos:
{
  "title": "string - título curto e objetivo (obrigatório)",
  "description": "string | null - detalhes adicionais",
  "priority": "low | medium | high | null",
  "due_date": "ISO 8601 string | null - data e hora se mencionado",
  "time": "HH:MM | null - horário se mencionado",
  "category": "string | null - categoria se mencionada",
  "is_task": boolean - true se a mensagem parece ser uma tarefa
}
Data/hora atual: ${today}`,
      },
      { role: 'user', content: text },
    ],
  });

  return JSON.parse(response.choices[0].message.content!);
}

interface ExtractedTask {
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high' | null;
  due_date: string | null;
  time: string | null;
  category: string | null;
  is_task: boolean;
}
```

### `whatsappService.ts`

```typescript
// packages/backend/src/services/whatsappService.ts

const WA_API_URL = `https://graph.facebook.com/v19.0/${process.env.WA_PHONE_NUMBER_ID}/messages`;

export async function sendTextMessage(to: string, text: string): Promise<void> {
  await fetch(WA_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });
}

export async function downloadMedia(mediaId: string): Promise<Buffer> {
  // 1. Busca URL do mídia
  const urlRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}` },
  });
  const { url } = await urlRes.json();

  // 2. Baixa o arquivo
  const fileRes = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}` },
  });
  return Buffer.from(await fileRes.arrayBuffer());
}

export function formatTaskConfirmation(task: {
  title: string;
  due_date?: string | null;
  time?: string | null;
  priority?: string | null;
}): string {
  const priorityEmoji: Record<string, string> = { low: '🟢', medium: '🟡', high: '🔴' };
  const priorityLabel: Record<string, string> = { low: 'Baixa prioridade', medium: 'Média prioridade', high: 'Alta prioridade' };

  const lines = ['🤖 *Entendi! Quer criar essa tarefa?*', '', `📌 *${task.title}*`];
  if (task.due_date) lines.push(`📅 ${new Date(task.due_date).toLocaleDateString('pt-BR')}`);
  if (task.time) lines.push(`⏰ ${task.time}`);
  if (task.priority) lines.push(`${priorityEmoji[task.priority]} ${priorityLabel[task.priority]}`);
  lines.push('', 'Responda *sim* para confirmar ou *não* para cancelar.');
  return lines.join('\n');
}
```

---

## Fila de Processamento (BullMQ)

```typescript
// packages/backend/src/queues/whatsappQueue.ts

import { Queue, Worker } from 'bullmq';
import { transcribeAudio, extractTaskFromText } from '../services/openaiService';
import { sendTextMessage, downloadMedia, formatTaskConfirmation } from '../services/whatsappService';

export const whatsappQueue = new Queue('whatsapp-messages', {
  connection: { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) },
});

export const whatsappWorker = new Worker(
  'whatsapp-messages',
  async (job) => {
    const { from, messageType, content, mediaId } = job.data;

    // 1. Encontra usuário pelo número
    const user = await findUserByWhatsappPhone(from);
    if (!user) {
      await sendTextMessage(
        from,
        '❌ Seu número não está vinculado a nenhuma conta Jarvi.\nAcesse jarvi.app/settings para vincular.'
      );
      return;
    }

    // 2. Transcreve se for áudio
    let text = content;
    if (messageType === 'audio') {
      await sendTextMessage(from, '⏳ Processando seu áudio...');
      const audioBuffer = await downloadMedia(mediaId);
      text = await transcribeAudio(audioBuffer, 'audio/ogg');
    }

    // 3. Extrai tarefa via LLM
    const extracted = await extractTaskFromText(text);

    if (!extracted.is_task) {
      await sendTextMessage(
        from,
        '🤔 Não entendi como uma tarefa. Descreva o que você precisa fazer e quando.'
      );
      return;
    }

    // 4. Cria pending task no banco
    const pendingTask = await createPendingTask({ userId: user.id, rawContent: text, ...extracted });

    // 5. Responde no WhatsApp com preview
    await sendTextMessage(from, formatTaskConfirmation(extracted));

    // 6. Notifica frontend via Socket.io
    io.to(`user:${user.id}`).emit('pending-task:created', pendingTask);
  },
  { connection: { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) } }
);
```

---

## Webhook Controller

```typescript
// packages/backend/src/controllers/whatsappWebhookController.ts

import crypto from 'crypto';
import { whatsappQueue } from '../queues/whatsappQueue';

// GET - Verificação do webhook pela Meta
export async function verifyWebhook(req: Request, res: Response) {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === process.env.WA_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

// POST - Receber mensagem
export async function receiveMessage(req: Request, res: Response) {
  // Valida assinatura HMAC (obrigatório pela Meta)
  const signature = req.headers['x-hub-signature-256'] as string;
  const expected = `sha256=${crypto
    .createHmac('sha256', process.env.WA_APP_SECRET!)
    .update(JSON.stringify(req.body))
    .digest('hex')}`;

  if (signature !== expected) return res.sendStatus(401);

  // Responde imediatamente — Meta exige resposta em < 5s
  res.sendStatus(200);

  const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return;

  const from = message.from;
  const messageType = message.type; // 'text' | 'audio'

  // Verifica se é resposta de confirmação
  if (messageType === 'text') {
    const text = message.text.body.trim().toLowerCase();
    if (['sim', 's', 'yes', 'confirmar', 'ok'].includes(text)) {
      await handleConfirmation(from);
      return;
    }
    if (['não', 'nao', 'n', 'no', 'cancelar'].includes(text)) {
      await handleRejection(from);
      return;
    }
  }

  // Enfileira para processamento assíncrono
  await whatsappQueue.add('process-message', {
    from,
    messageType,
    content: message.text?.body,
    mediaId: message.audio?.id,
  });
}
```

---

## Variáveis de Ambiente

Adicionar ao `.env`:

```env
# OpenAI
OPENAI_API_KEY=sk-...

# Meta WhatsApp Cloud API
WA_PHONE_NUMBER_ID=      # ID do número de telefone no Meta Business
WA_ACCESS_TOKEN=         # Token permanente de acesso
WA_VERIFY_TOKEN=         # Token secreto para verificação do webhook (você define)
WA_APP_SECRET=           # App Secret do app no Meta Developers

# Redis (já no docker-compose — adicionar ao .env se necessário)
REDIS_HOST=localhost
REDIS_PORT=6379
```

---

## Frontend: Seção de Tarefas Pendentes

### Hook `usePendingTasks.ts`

```typescript
// packages/web/src/hooks/usePendingTasks.ts

export function usePendingTasks() {
  const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);

  useEffect(() => {
    // Fetch inicial
    api.get('/api/pending-tasks').then(({ data }) => setPendingTasks(data));

    // Escuta Socket.io para updates em tempo real
    socket.on('pending-task:created', (task: PendingTask) => {
      setPendingTasks((prev) => [task, ...prev]);
      toast('📱 Nova tarefa sugerida pelo WhatsApp');
    });

    return () => {
      socket.off('pending-task:created');
    };
  }, []);

  const confirm = async (id: string) => {
    await api.post(`/api/pending-tasks/${id}/confirm`);
    setPendingTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const reject = async (id: string) => {
    await api.post(`/api/pending-tasks/${id}/reject`);
    setPendingTasks((prev) => prev.filter((t) => t.id !== id));
  };

  return { pendingTasks, confirm, reject };
}
```

### UI na página de Tarefas

A seção aparece **no topo** quando existirem pending tasks, antes das seções "Hoje", "Amanhã" etc.:

```
┌─────────────────────────────────────────────────────────────┐
│  📱 Pendentes do WhatsApp  (2)                              │
├─────────────────────────────────────────────────────────────┤
│  🤖 Reunião com o cliente João                              │
│     📅 Amanhã às 14h  ·  🔴 Alta prioridade                │
│     Via WhatsApp · há 5 min                                 │
│                        [Editar]  [Rejeitar]  [✓ Confirmar]  │
├─────────────────────────────────────────────────────────────┤
│  🤖 Enviar proposta para empresa XYZ                        │
│     📅 Sem data  ·  ⚪ Prioridade não definida              │
│     Via WhatsApp · há 32 min                                │
│                        [Editar]  [Rejeitar]  [✓ Confirmar]  │
└─────────────────────────────────────────────────────────────┘
```

---

## Vinculação do Número WhatsApp (Settings)

**Fluxo de segurança (código de verificação):**

1. Usuário acessa **Configurações → Integrações → WhatsApp**
2. Informa o número com DDD (ex: `11999999999`)
3. Backend gera código de 6 dígitos, válido por 10 minutos
4. Backend envia via WhatsApp: _"Seu código Jarvi é: **847291**"_
5. Usuário digita o código na plataforma
6. Backend valida e salva `whatsapp_phone` + `whatsapp_verified = true`

> Essa abordagem evita que qualquer pessoa que saiba o número de outra crie tarefas em seu lugar.

---

## Ordem de Execução (Sprints)

### Sprint 1 — Fundação
- [ ] Criar conta Meta Business + configurar WhatsApp Cloud API
- [ ] Criar número de telefone no Meta Business Manager
- [ ] Configurar variáveis de ambiente (`WA_*`, `OPENAI_API_KEY`)
- [ ] Migration: colunas `whatsapp_*` na tabela `users`
- [ ] Migration: tabela `pending_tasks`
- [ ] Instalar dependências: `openai`, `bullmq`

### Sprint 2 — Backend Core
- [ ] `openaiService.ts` — Whisper + GPT-4o-mini
- [ ] `whatsappService.ts` — envio de mensagens + download de mídia
- [ ] Rotas do webhook GET/POST (`/api/webhooks/whatsapp`)
- [ ] Validação de assinatura HMAC (`X-Hub-Signature-256`)
- [ ] Fila BullMQ (`whatsappQueue.ts`) + Worker
- [ ] Worker: texto → pending task + resposta WhatsApp
- [ ] Worker: áudio → Whisper → pending task + resposta WhatsApp

### Sprint 3 — Confirmação e CRUD
- [ ] Processar resposta "sim/não" via WhatsApp
- [ ] Endpoints CRUD de pending tasks (GET, confirm, reject, update, delete)
- [ ] `POST /api/pending-tasks/:id/confirm` → cria task real via lógica existente
- [ ] Emitir evento Socket.io `pending-task:created` ao criar pending task

### Sprint 4 — Vinculação do Número
- [ ] Endpoint `POST /api/users/whatsapp-link/request` (gera e envia código)
- [ ] Endpoint `POST /api/users/whatsapp-link/verify` (valida código)
- [ ] Endpoint `DELETE /api/users/whatsapp-link` (desvincula)
- [ ] UI Settings: tela de vinculação WhatsApp

### Sprint 5 — Frontend
- [ ] Hook `usePendingTasks` com Socket.io
- [ ] Componente `PendingTaskCard` (preview + ações)
- [ ] Seção "Pendentes do WhatsApp" na página de Tasks
- [ ] Toast de notificação ao receber nova pending task
- [ ] Badge no nav com contador de pendentes

### Sprint 6 — Polimento e Produção
- [ ] Expiração automática de pending tasks após 24h
- [ ] Rate limiting no endpoint do webhook
- [ ] Mensagem de fallback para conteúdo que não é tarefa
- [ ] Mensagem "⏳ Processando..." imediata para áudios
- [ ] Testes de integração do webhook
- [ ] Configurar URL do webhook no Meta Business (ngrok local / URL de produção)

---

## Custos Estimados

| Serviço | Custo |
|---|---|
| Meta WhatsApp Cloud API | Gratuito até 1.000 conversas/mês |
| OpenAI Whisper | ~$0,006 por minuto de áudio |
| OpenAI GPT-4o-mini | ~$0,15 por 1M tokens (muito barato) |
| Redis | Já incluso no docker-compose |

---

## Referências

- [Meta WhatsApp Cloud API — Docs](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Meta — Configurar Webhook](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks)
- [OpenAI Whisper API](https://platform.openai.com/docs/api-reference/audio/createTranscription)
- [OpenAI GPT-4o-mini](https://platform.openai.com/docs/models/gpt-4o-mini)
- [BullMQ — Docs](https://docs.bullmq.io)
