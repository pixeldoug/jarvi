# Runbook - Ativacao WhatsApp em Producao (Jarvi)

## Objetivo

Publicar a funcionalidade de criacao de tarefas via WhatsApp usando numero oficial da Jarvi, com seguranca e validacao de ponta a ponta.

---

## 1) Pre-condicoes (apos aprovacao do bundle)

- [ ] Regulatory Bundle BR com status `Approved`
- [ ] Numero adquirido e ativo no Twilio
- [ ] WhatsApp Sender conectado ao numero (Meta/Twilio)
- [ ] Backend de producao acessivel por URL publica HTTPS
- [ ] Redis de producao ativo (fila BullMQ)

---

## 2) Configuracao no Twilio (producao)

1. Acesse `Messaging > Senders > WhatsApp Senders`
2. Selecione o sender/numero da Jarvi
3. Configure inbound webhook:
   - **When a message comes in**: `https://SEU_BACKEND/api/webhooks/whatsapp`
   - **Method**: `POST`
4. Salve e confirme status do sender como conectado/aprovado

> Observacao: `Status callback URL` e opcional. O essencial para funcionar e o webhook inbound.

---

## 3) Variaveis de ambiente no backend de producao

Defina (ou revise):

```env
NODE_ENV=production
PORT=3001

DATABASE_URL=postgresql://...
REDIS_HOST=...
REDIS_PORT=6379

JWT_SECRET=...

OPENAI_API_KEY=...

TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_NUMBER=+55XXXXXXXXXXX
TWILIO_WEBHOOK_URL=https://SEU_BACKEND/api/webhooks/whatsapp

FRONTEND_URL=https://SEU_FRONTEND
```

Opcionais recomendadas:

```env
WHATSAPP_MESSAGE_AGGREGATION_WINDOW_MS=8000
WHATSAPP_PDF_TEXT_MAX_CHARS=6000
```

---

## 4) Deploy/restart e checks tecnicos

- [ ] Reiniciar backend de producao (para carregar env + worker)
- [ ] Validar saude: `GET https://SEU_BACKEND/health`
- [ ] Validar logs apos restart:
  - Banco inicializado
  - Worker WhatsApp inicializado
  - Sem erro de env ausente

---

## 5) Smoke test funcional (obrigatorio)

### Fluxo A - Vinculacao

- [ ] Em Settings, solicitar codigo de vinculo
- [ ] Receber codigo no WhatsApp
- [ ] Confirmar vinculo com sucesso

### Fluxo B - Criacao por texto

- [ ] Enviar mensagem simples de tarefa
- [ ] Receber sugestao
- [ ] Confirmar `sim`
- [ ] Tarefa criada na plataforma

### Fluxo C - PDF + contexto

- [ ] Enviar PDF + texto "preciso pagar amanha"
- [ ] Validar sugestao com data correta
- [ ] Confirmar que aparece em "Pendentes do WhatsApp"
- [ ] Confirmar criacao final

### Fluxo D - Continuacao de contexto

- [ ] Ajustar por WhatsApp ("pra amanha, nao dia X")
- [ ] Sugestao deve atualizar sem criar pendente duplicada

---

## 6) Operacao nas primeiras 48h

- [ ] Monitorar Twilio Debugger (erros 11200/assinatura/webhook)
- [ ] Monitorar logs de backend do webhook e da fila
- [ ] Verificar tempo de resposta do webhook (sem timeout)
- [ ] Confirmar ausencia de pendencias duplicadas

---

## 7) Regras de negocio WhatsApp (producao)

- Dentro de **24h da ultima mensagem do usuario**: respostas livres permitidas
- Fora da janela de 24h: usar **template aprovado** para iniciar contato proativo

---

## 8) Plano de rollback (se der problema)

1. Trocar webhook inbound no Twilio para endpoint de manutencao/backup
2. Preservar sender ativo (nao precisa remover numero)
3. Corrigir backend e reativar webhook principal
4. Reexecutar smoke test completo antes de reabrir

---

## Campos preenchiveis para Go-Live

- `SEU_BACKEND`: ______________________________________
- `SEU_FRONTEND`: _____________________________________
- Responsavel tecnico: _________________________________
- Data de go-live: ____________________________________
- Janela de monitoramento reforcado: ___________________

