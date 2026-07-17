# Runbook - Lembretes por Ligação (canal "call")

## Objetivo

Ativar o canal de lembrete por Ligação (Twilio Voice), que complementa o canal WhatsApp já existente no motor de lembretes (`packages/backend/src/services/reminderService.ts`).

---

## 1) Como funciona

1. O agendador de lembretes (`node-cron`, a cada minuto) identifica lembretes com `channel = 'call'` vencidos.
2. `reminderService` chama `initiateReminderCall` (`packages/backend/src/services/voiceService.ts`), que cria uma ligação via Twilio (`client.calls.create`) para o número de WhatsApp verificado do usuário (`users.whatsapp_phone`).
3. Quando a ligação é atendida, o Twilio busca o TwiML em `POST /api/webhooks/voice/reminder-twiml?reminderId=...`. O backend responde com um `<Say>` (voz `Polly.Camila`, `pt-BR`) lendo o título da tarefa, data e horário — falado duas vezes.
4. Atualizações de status da ligação (`initiated`, `ringing`, `answered`, `completed`) chegam em `POST /api/webhooks/voice/status?reminderId=...` e são apenas logadas (a entrega é "fire-and-forget", igual ao canal WhatsApp: o lembrete é marcado como `sent` assim que o Twilio aceita a criação da ligação, sem esperar atendimento).
5. Assim como no WhatsApp, o canal Ligação requer `whatsapp_phone` + `whatsapp_verified` no usuário (não existe verificação de telefone separada — reaproveitamos a mesma verificação).

---

## 2) Pré-condições

- [ ] Conta Twilio já usada para WhatsApp (mesmo `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`)
- [ ] Número Twilio com **capacidade de voz habilitada** (`TWILIO_VOICE_NUMBER`) — em produção normalmente é um número diferente do sender de WhatsApp
- [ ] Backend acessível publicamente por URL HTTPS (`BACKEND_PUBLIC_URL`)

> Em dev/teste, se `TWILIO_VOICE_NUMBER` não estiver definido, o código cai para `TWILIO_WHATSAPP_NUMBER` (removendo o prefixo `whatsapp:`). Isso só funciona se esse número também tiver voz habilitada no Twilio.

---

## 3) Variáveis de ambiente

```env
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_VOICE_NUMBER=+55XXXXXXXXXXX
BACKEND_PUBLIC_URL=https://SEU_BACKEND
```

Não é necessário configurar nada manualmente no console do Twilio para os webhooks de voz — as URLs (`url` e `statusCallback`) são passadas dinamicamente em cada `calls.create()`, não dependem de configuração estática de um número/TwiML App.

---

## 4) Segurança

Os dois endpoints (`/api/webhooks/voice/reminder-twiml` e `/api/webhooks/voice/status`) validam o header `X-Twilio-Signature` (mesma lógica usada pelo webhook inbound do WhatsApp, extraída para `packages/backend/src/utils/twilioSignature.ts`). Requisições sem assinatura válida recebem `401`.

---

## 5) Smoke test manual

1. Crie uma tarefa com um lembrete de canal "Ligação" (Absoluto, poucos minutos no futuro) com um usuário que já tenha WhatsApp verificado.
2. Aguarde o agendador (roda a cada minuto) ou monitore os logs do backend por `[reminderService] Processed`.
3. Confirme que o telefone recebe uma ligação da Jarvi lendo o lembrete.
4. Verifique nos logs a entrada `[voiceWebhookController] Reminder call status update` com o `CallStatus` final (`completed`, `no-answer`, `busy`, etc.).

---

## 6) Limitações conhecidas

- Não há retentativa automática se a ligação não for atendida (`no-answer`/`busy`) — o lembrete já foi marcado como `sent` no momento em que a ligação foi criada.
- Não há coluna de banco para persistir o resultado da ligação (`CallStatus`/`CallSid`); o status callback apenas loga, para observabilidade em produção (Railway logs).
