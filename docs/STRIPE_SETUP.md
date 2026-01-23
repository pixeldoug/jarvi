# Stripe Subscription Setup

Este guia explica como configurar o Stripe para gerenciar assinaturas no Jarvi.

## Visão Geral

O Jarvi usa Stripe para:
- Gerenciar trial de 14 dias
- Processar pagamentos recorrentes
- Enviar notificações de fim de trial (3 dias antes)
- Gerenciar status da assinatura

## Configuração no Stripe Dashboard

### 1. Criar Produto e Preço

1. Acesse [dashboard.stripe.com](https://dashboard.stripe.com)
2. Vá em **Products** → **Add product**
3. Configure:
   - **Name**: Jarvi Pro
   - **Pricing**: R$ 29,00 (ou seu valor)
   - **Billing period**: Monthly
4. Copie o **Price ID** (`price_...`)

### 2. Obter API Keys

1. Vá em **Developers** → **API keys**
2. Copie:
   - **Publishable key** (`pk_test_...` ou `pk_live_...`)
   - **Secret key** (`sk_test_...` ou `sk_live_...`)

### 3. Configurar Webhook (Produção)

1. Vá em **Developers** → **Webhooks**
2. Clique em **Add endpoint**
3. Configure:
   - **URL**: `https://seu-backend.com/webhooks/stripe`
   - **Events**:
     - `customer.subscription.trial_will_end`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
4. Copie o **Webhook signing secret** (`whsec_...`)

## Variáveis de Ambiente

### Backend (`packages/backend/.env`)

```env
# Stripe
STRIPE_SECRET_KEY=sk_test_sua_chave_aqui
STRIPE_WEBHOOK_SECRET=whsec_sua_chave_aqui
STRIPE_PRICE_ID=price_seu_price_id_aqui
```

### Frontend (`packages/web/.env`)

```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_sua_chave_aqui
```

### Railway (Produção)

Adicione as mesmas variáveis na aba **Variables** do serviço backend no Railway.

## Desenvolvimento Local

Para desenvolvimento local, use o **Stripe CLI** para receber webhooks.

### Setup Rápido

```bash
# Executar script de setup (instala CLI e faz login)
npm run stripe:setup
```

### Setup Manual

1. **Instalar Stripe CLI**

   ```bash
   # macOS
   brew install stripe/stripe-cli/stripe
   
   # Linux
   # Veja: https://stripe.com/docs/stripe-cli#install
   ```

2. **Fazer login**

   ```bash
   stripe login
   ```

3. **Iniciar listener de webhooks**

   ```bash
   # Na raiz do projeto
   npm run stripe:listen
   
   # Ou diretamente
   stripe listen --forward-to localhost:3001/webhooks/stripe
   ```

   O CLI vai mostrar um webhook secret temporário:
   ```
   > Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxx
   ```

   Use esse `whsec_` no seu `.env` local.

### Desenvolvimento com Stripe

Para rodar backend, frontend e listener de webhooks juntos:

```bash
npm run dev:stripe
```

### Testar Eventos

```bash
# Simular fim do trial (3 dias antes)
npm run stripe:trigger:trial-end

# Simular pagamento bem sucedido
npm run stripe:trigger:payment-success

# Simular falha no pagamento
npm run stripe:trigger:payment-failed
```

Ou diretamente com o CLI:

```bash
stripe trigger customer.subscription.trial_will_end
stripe trigger invoice.payment_succeeded
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.deleted
```

## Fluxo de Assinatura

```
1. Usuário registra (Google OAuth ou email/senha)
2. Redirecionado para /subscribe
3. Insere cartão de crédito via Stripe Elements
4. Backend cria Stripe Customer + Subscription com trial de 14 dias
5. Usuário pode usar o app durante o trial
6. Dia 11: Stripe envia webhook `trial_will_end`, backend notifica usuário
7. Dia 14: Stripe cobra o cartão
8. Se sucesso: status = `active`
9. Se falha: status = `past_due`, usuário notificado
```

## Status da Assinatura

| Status | Descrição |
|--------|-----------|
| `none` | Usuário nunca assinou |
| `trialing` | Em período de trial |
| `active` | Assinatura ativa e paga |
| `past_due` | Pagamento falhou, aguardando |
| `canceled` | Assinatura cancelada |

## Endpoints da API

### Criar Assinatura

```http
POST /api/subscriptions/create
Authorization: Bearer <token>
Content-Type: application/json

{
  "paymentMethodId": "pm_..."
}
```

### Verificar Status

```http
GET /api/subscriptions/status
Authorization: Bearer <token>
```

Resposta:
```json
{
  "status": "trialing",
  "trialEndsAt": "2024-02-01T00:00:00.000Z",
  "currentPeriodEnd": "2024-02-01T00:00:00.000Z",
  "isActive": true
}
```

### Cancelar Assinatura

```http
POST /api/subscriptions/cancel
Authorization: Bearer <token>
```

## Troubleshooting

### Webhook não está sendo recebido

1. Verifique se o Stripe CLI está rodando: `npm run stripe:listen`
2. Confirme que o backend está rodando na porta 3001
3. Verifique se o `STRIPE_WEBHOOK_SECRET` está correto

### Erro de assinatura

1. Verifique se `STRIPE_PRICE_ID` está configurado
2. Confirme que o produto existe no Stripe Dashboard
3. Verifique os logs do backend para erros detalhados

### Cartão recusado em teste

Use os cartões de teste do Stripe:
- **Sucesso**: `4242 4242 4242 4242`
- **Falha**: `4000 0000 0000 0002`
- **Requer autenticação**: `4000 0025 0000 3155`

Mais cartões: https://stripe.com/docs/testing#cards
