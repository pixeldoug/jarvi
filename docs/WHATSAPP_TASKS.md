# Plano de Implementação: Criação de Tarefas via WhatsApp

## Visão Geral

Permitir que usuários enviem mensagens de texto, áudio ou imagem para um número WhatsApp
da Jarvi e, a partir disso, a IA sugira a criação de uma tarefa. O usuário confirma
pelo próprio WhatsApp ou pela plataforma web.

**Fluxo resumido:**

```
Mensagem WhatsApp → Twilio Webhook → AI (transcrição/visão + extração) → Pending Task
→ Confirmação (WhatsApp ou Web) → Tarefa criada
```

---

## Stack de Implementação

| Camada | Tecnologia |
|---|---|
| WhatsApp API | **Twilio WhatsApp API** (sandbox gratuito, sem conta Meta) |
| Transcrição de áudio | OpenAI Whisper (`whisper-1`) |
| Extração de tarefa (texto) | OpenAI GPT-4o-mini |
| Extração de tarefa (imagem) | OpenAI GPT-4o (Vision) |
| Fila assíncrona | BullMQ + Redis (Redis já está no docker-compose) |
| Real-time frontend | Socket.io (já em uso) |
| Backend | Express + TypeScript (já existente) |
| DB | SQLite (dev) / PostgreSQL (prod) (já existente) |

---

## Por que Twilio em vez da Meta Cloud API

| | Twilio | Meta Cloud API |
|---|---|---|
| Conta necessária | Apenas Twilio | Conta Meta Business verificada |
| Sandbox para testes | ✅ Imediato (join sandbox) | ❌ Precisa aprovação |
| SDK oficial Node.js | ✅ `npm install twilio` | ❌ Apenas REST manual |
| Formato do webhook | `application/x-www-form-urlencoded` | `application/json` |
| Validação de assinatura | `X-Twilio-Signature` (HMAC-SHA1) | `X-Hub-Signature-256` (HMAC-SHA256) |
| Download de mídia | URL direta com Basic Auth | Graph API em 2 etapas |
| Custo | ~$0,005/mensagem | Gratuito até 1.000 conversas/mês |

---

## Arquitetura de Arquivos

### Novos arquivos no backend

```
packages/backend/src/
├── services/
│   ├── openaiService.ts              ← Whisper (STT) + GPT-4o-mini (texto) + GPT-4o Vision (imagem)
│   └── whatsappService.ts            ← Envio de mensagens via Twilio SDK
├── controllers/
│   ├── whatsappWebhookController.ts  ← Processa mensagens recebidas (POST apenas)
│   └── pendingTaskController.ts      ← CRUD de pending tasks
├── routes/
│   ├── whatsappRoutes.ts             ← POST /api/webhooks/whatsapp
│   └── pendingTaskRoutes.ts          ← /api/pending-tasks
├── queues/
│   └── whatsappQueue.ts              ← Fila BullMQ para processar mensagens
└── database/
    └── migrations/
        ├── add_whatsapp_phone_to_users.ts
        └── create_pending_tasks.ts
```

> **Diferença em relação ao plano original:** não há rota GET para verificação de webhook.
> O Twilio não usa o modelo hub.challenge da Meta — basta configurar a URL no console e pronto.

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
  whatsapp_message_sid TEXT,
  whatsapp_phone TEXT,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

> Nota: campo renomeado de `whatsapp_message_id` para `whatsapp_message_sid` (padrão Twilio).

---

## Endpoints da API

### Webhook WhatsApp (Twilio)

```
POST /api/webhooks/whatsapp
     → Recebe eventos do WhatsApp via Twilio
     → Valida assinatura X-Twilio-Signature (HMAC-SHA1)
     → Sem autenticação JWT
     → Responde com TwiML vazio imediatamente
     → Enfileira mensagem no BullMQ
```

> Não há rota GET — o Twilio não requer verificação de webhook.

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

const TASK_SYSTEM_PROMPT = `Você é um assistente que extrai informações de tarefas a partir de mensagens
em português. Retorne SEMPRE um JSON válido com os campos:
{
  "title": "string - título curto e objetivo (obrigatório)",
  "description": "string | null - detalhes adicionais",
  "priority": "low | medium | high | null",
  "due_date": "ISO 8601 string | null - data e hora se mencionado",
  "time": "HH:MM | null - horário se mencionado",
  "category": "string | null - categoria se mencionada",
  "is_task": boolean - true se o conteúdo parece ser uma tarefa
}`;

export interface ExtractedTask {
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high' | null;
  due_date: string | null;
  time: string | null;
  category: string | null;
  is_task: boolean;
}

// Transcreve áudio recebido via Twilio (OGG/Opus, MP4, etc.)
export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'ogg';
  const file = new File([audioBuffer], `audio.${extension}`, { type: mimeType });
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'pt',
  });
  return transcription.text;
}

// Extrai tarefa a partir de texto
export async function extractTaskFromText(text: string): Promise<ExtractedTask> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `${TASK_SYSTEM_PROMPT}\nData/hora atual: ${new Date().toISOString()}`,
      },
      { role: 'user', content: text },
    ],
  });
  return JSON.parse(response.choices[0].message.content!);
}

// Extrai tarefa a partir de imagem (GPT-4o Vision)
export async function extractTaskFromImage(imageBuffer: Buffer, mimeType: string): Promise<ExtractedTask> {
  const base64 = imageBuffer.toString('base64');
  const response = await openai.chat.completions.create({
    model: 'gpt-4o', // 4o-mini não suporta vision
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `${TASK_SYSTEM_PROMPT}\nData/hora atual: ${new Date().toISOString()}`,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extraia uma tarefa a partir do conteúdo desta imagem.',
          },
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64}` },
          },
        ],
      },
    ],
  });
  return JSON.parse(response.choices[0].message.content!);
}
```

### `whatsappService.ts`

```typescript
// packages/backend/src/services/whatsappService.ts

import twilio from 'twilio';

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export async function sendTextMessage(to: string, text: string): Promise<void> {
  await client.messages.create({
    from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
    to: `whatsapp:${to}`,
    body: text,
  });
}

// Twilio hospeda a mídia em seus próprios servidores — basta baixar com Basic Auth
export async function downloadMedia(mediaUrl: string): Promise<Buffer> {
  const credentials = Buffer.from(
    `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
  ).toString('base64');

  const response = await fetch(mediaUrl, {
    headers: { Authorization: `Basic ${credentials}` },
  });

  if (!response.ok) throw new Error(`Falha ao baixar mídia: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export function formatTaskConfirmation(task: {
  title: string;
  due_date?: string | null;
  time?: string | null;
  priority?: string | null;
}): string {
  const priorityEmoji: Record<string, string> = { low: '🟢', medium: '🟡', high: '🔴' };
  const priorityLabel: Record<string, string> = {
    low: 'Baixa prioridade',
    medium: 'Média prioridade',
    high: 'Alta prioridade',
  };

  const lines = ['🤖 *Entendi! Quer criar essa tarefa?*', '', `📌 *${task.title}*`];
  if (task.due_date) lines.push(`📅 ${new Date(task.due_date).toLocaleDateString('pt-BR')}`);
  if (task.time) lines.push(`⏰ ${task.time}`);
  if (task.priority && priorityEmoji[task.priority]) {
    lines.push(`${priorityEmoji[task.priority]} ${priorityLabel[task.priority]}`);
  }
  lines.push('', 'Responda *sim* para confirmar ou *não* para cancelar.');
  return lines.join('\n');
}
```

---

## Webhook Controller

```typescript
// packages/backend/src/controllers/whatsappWebhookController.ts

import twilio from 'twilio';
import { Request, Response } from 'express';
import { whatsappQueue } from '../queues/whatsappQueue';

// POST — Receber mensagem do Twilio
// ⚠️ Esta rota precisa de express.urlencoded() (não express.json())
//    O Twilio envia application/x-www-form-urlencoded
export async function receiveMessage(req: Request, res: Response) {
  // Valida assinatura X-Twilio-Signature
  const signature = req.headers['x-twilio-signature'] as string;
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  const isValid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN!,
    signature,
    url,
    req.body // objeto { From, To, Body, NumMedia, ... } — já parseado pelo urlencoded()
  );

  if (!isValid) return res.sendStatus(401);

  // Responde imediatamente com TwiML vazio — Twilio aguarda resposta em < 15s
  res.set('Content-Type', 'text/xml');
  res.send('<Response></Response>');

  // Twilio prefixo "whatsapp:+5511..." — remove o prefixo para guardar apenas o número
  const from = (req.body.From as string).replace('whatsapp:', '');
  const body = (req.body.Body as string) ?? '';
  const numMedia = parseInt(req.body.NumMedia ?? '0', 10);
  const mediaContentType = req.body.MediaContentType0 as string | undefined;
  const mediaUrl = req.body.MediaUrl0 as string | undefined;

  // Detecta tipo de mensagem pelo conteúdo de mídia
  let messageType: 'text' | 'audio' | 'image' = 'text';
  if (numMedia > 0 && mediaContentType) {
    if (mediaContentType.startsWith('audio')) messageType = 'audio';
    else if (mediaContentType.startsWith('image')) messageType = 'image';
  }

  // Verifica se é resposta de confirmação de pending task
  if (messageType === 'text' && body) {
    const normalized = body.trim().toLowerCase();
    if (['sim', 's', 'yes', 'confirmar', 'ok'].includes(normalized)) {
      await handleConfirmation(from);
      return;
    }
    if (['não', 'nao', 'n', 'no', 'cancelar'].includes(normalized)) {
      await handleRejection(from);
      return;
    }
  }

  await whatsappQueue.add('process-message', {
    from,
    messageType,
    content: body,
    mediaUrl,       // URL hospedada pelo Twilio (ao invés de mediaId da Meta)
    mediaContentType,
  });
}
```

> **Atenção no `index.ts` do backend:** a rota do webhook precisa usar `express.urlencoded()` em vez de `express.json()`:
>
> ```typescript
> // Apenas para a rota do webhook Twilio
> app.use('/api/webhooks/whatsapp', express.urlencoded({ extended: false }));
> app.use('/api/webhooks/whatsapp', whatsappRoutes);
> ```

---

## Fila de Processamento (BullMQ)

```typescript
// packages/backend/src/queues/whatsappQueue.ts

import { Queue, Worker } from 'bullmq';
import { transcribeAudio, extractTaskFromText, extractTaskFromImage } from '../services/openaiService';
import { sendTextMessage, downloadMedia, formatTaskConfirmation } from '../services/whatsappService';

export const whatsappQueue = new Queue('whatsapp-messages', {
  connection: { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) },
});

export const whatsappWorker = new Worker(
  'whatsapp-messages',
  async (job) => {
    const { from, messageType, content, mediaUrl, mediaContentType } = job.data;

    // 1. Encontra usuário pelo número vinculado
    const user = await findUserByWhatsappPhone(from);
    if (!user) {
      await sendTextMessage(
        from,
        '❌ Seu número não está vinculado a nenhuma conta Jarvi.\nAcesse jarvi.app/settings para vincular.'
      );
      return;
    }

    let text: string = content;
    let extracted;

    if (messageType === 'audio') {
      // 2a. Áudio → transcreve com Whisper
      await sendTextMessage(from, '⏳ Processando seu áudio...');
      const audioBuffer = await downloadMedia(mediaUrl);
      text = await transcribeAudio(audioBuffer, mediaContentType ?? 'audio/ogg');
      extracted = await extractTaskFromText(text);

    } else if (messageType === 'image') {
      // 2b. Imagem → extrai com GPT-4o Vision
      await sendTextMessage(from, '⏳ Analisando sua imagem...');
      const imageBuffer = await downloadMedia(mediaUrl);
      extracted = await extractTaskFromImage(imageBuffer, mediaContentType ?? 'image/jpeg');

    } else {
      // 2c. Texto → extrai com GPT-4o-mini
      extracted = await extractTaskFromText(text);
    }

    // 3. Verifica se a IA identificou como tarefa
    if (!extracted.is_task) {
      await sendTextMessage(
        from,
        '🤔 Não entendi como uma tarefa. Descreva o que você precisa fazer e quando.'
      );
      return;
    }

    // 4. Cria pending task no banco
    const pendingTask = await createPendingTask({
      userId: user.id,
      rawContent: text,
      transcription: messageType === 'audio' ? text : undefined,
      ...extracted,
    });

    // 5. Responde no WhatsApp com preview da tarefa proposta
    await sendTextMessage(from, formatTaskConfirmation(extracted));

    // 6. Notifica frontend em tempo real via Socket.io
    io.to(`user:${user.id}`).emit('pending-task:created', pendingTask);
  },
  { connection: { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) } }
);
```

---

## Variáveis de Ambiente

Adicionar ao `.env`:

```env
# Twilio WhatsApp
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx   # Account SID no Twilio Console
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx      # Auth Token no Twilio Console
TWILIO_WHATSAPP_NUMBER=+14155238886                    # Sandbox: +14155238886 | Produção: seu número aprovado

# OpenAI
OPENAI_API_KEY=sk-...

# Redis (já no docker-compose — adicionar ao .env se necessário)
REDIS_HOST=localhost
REDIS_PORT=6379
```

---

## Configuração do Twilio Sandbox (Testes Locais)

O Twilio oferece um **sandbox WhatsApp gratuito** para desenvolvimento — sem aprovação de conta empresarial.

### Passos:

1. Crie conta em [twilio.com](https://www.twilio.com)
2. No console: **Messaging → Try it out → Send a WhatsApp message**
3. Você verá o número do sandbox (ex: `+14155238886`) e uma frase de join (ex: `join yellow-tiger`)
4. Cada desenvolvedor/testador envia essa mensagem para o número no WhatsApp
5. Configure a **Webhook URL** no painel do sandbox:
   - Use [ngrok](https://ngrok.com) para expor o servidor local: `ngrok http 3001`
   - URL do webhook: `https://xxxx.ngrok.io/api/webhooks/whatsapp`
   - Método: **HTTP POST**

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
2. Informa o número com DDI+DDD (ex: `+5511999999999`)
3. Backend gera código de 6 dígitos, válido por 10 minutos
4. Backend envia via WhatsApp (Twilio): _"Seu código Jarvi é: **847291**"_
5. Usuário digita o código na plataforma
6. Backend valida e salva `whatsapp_phone` + `whatsapp_verified = true`

> Essa abordagem evita que qualquer pessoa que saiba o número de outra crie tarefas em seu lugar.

> **No sandbox Twilio:** o usuário precisa ter enviado o `join <palavra>` antes de receber mensagens.
> Em produção (número aprovado), isso não é necessário.

---

## Ordem de Execução (Sprints)

### Sprint 1 — Fundação
- [ ] Criar conta Twilio em [twilio.com](https://twilio.com)
- [ ] Ativar sandbox WhatsApp (Console → Messaging → Try it out → Send a WhatsApp message)
- [ ] Configurar variáveis de ambiente (`TWILIO_*`, `OPENAI_API_KEY`)
- [ ] Migration: colunas `whatsapp_*` na tabela `users`
- [ ] Migration: tabela `pending_tasks`
- [ ] Instalar dependências: `openai`, `bullmq`, `twilio`

### Sprint 2 — Vinculação do Número (pré-requisito para testes reais)
- [ ] Endpoint `POST /api/users/whatsapp-link/request` (gera e envia código via Twilio)
- [ ] Endpoint `POST /api/users/whatsapp-link/verify` (valida código, salva número)
- [ ] Endpoint `DELETE /api/users/whatsapp-link` (desvincula)
- [ ] UI Settings: tela de vinculação WhatsApp

### Sprint 3 — Backend Core
- [ ] `openaiService.ts` — Whisper + GPT-4o-mini (texto) + GPT-4o Vision (imagem)
- [ ] `whatsappService.ts` — Twilio SDK (envio + download de mídia)
- [ ] Rota webhook POST (`/api/webhooks/whatsapp`) com `express.urlencoded()`
- [ ] Validação de assinatura `X-Twilio-Signature`
- [ ] Fila BullMQ (`whatsappQueue.ts`) + Worker
- [ ] Worker: texto → pending task + resposta WhatsApp
- [ ] Worker: áudio → Whisper → pending task + resposta WhatsApp
- [ ] Worker: imagem → GPT-4o Vision → pending task + resposta WhatsApp
- [ ] Configurar webhook URL no sandbox Twilio (via ngrok)

### Sprint 4 — Confirmação e CRUD
- [ ] Processar resposta "sim/não" via WhatsApp (antes de enfileirar)
- [ ] Endpoints CRUD de pending tasks (GET, confirm, reject, update, delete)
- [ ] `POST /api/pending-tasks/:id/confirm` → cria task real via lógica existente
- [ ] Emitir evento Socket.io `pending-task:created` ao criar pending task

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
- [ ] Mensagem "⏳ Processando..." imediata para áudios e imagens
- [ ] Testes de integração do webhook
- [ ] Migrar do sandbox para número Twilio aprovado (ou solicitar número WhatsApp Business)

---

## Custos Estimados

| Serviço | Custo |
|---|---|
| Twilio WhatsApp Sandbox | Gratuito (para testes) |
| Twilio WhatsApp Produção | ~$0,005 por mensagem enviada ou recebida |
| OpenAI Whisper | ~$0,006 por minuto de áudio |
| OpenAI GPT-4o-mini | ~$0,15 por 1M tokens (extração de texto) |
| OpenAI GPT-4o (Vision) | ~$2,50 por 1M tokens input (extração de imagem) |
| Redis | Já incluso no docker-compose |

---

## Referências

- [Twilio WhatsApp API — Docs](https://www.twilio.com/docs/whatsapp)
- [Twilio WhatsApp Sandbox](https://www.twilio.com/docs/whatsapp/sandbox)
- [Twilio — Validação de Webhook](https://www.twilio.com/docs/usage/webhooks/webhooks-security)
- [Twilio Node.js SDK](https://www.twilio.com/docs/libraries/node)
- [OpenAI Whisper API](https://platform.openai.com/docs/api-reference/audio/createTranscription)
- [OpenAI GPT-4o Vision](https://platform.openai.com/docs/guides/vision)
- [BullMQ — Docs](https://docs.bullmq.io)
- [ngrok — Tunnel local](https://ngrok.com/docs)
