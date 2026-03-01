# 🔧 Backend Setup Guide

## 📋 Configuração de Ambiente

### 1. Arquivo .env

Copie o arquivo de exemplo e configure suas variáveis:

```bash
cp .env.example .env
```

### 2. Configurações Importantes

#### 🔐 JWT_SECRET
**CRÍTICO para segurança!**

```bash
# Gerar nova chave segura:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

⚠️ **NUNCA:**
- Compartilhe esta chave
- Faça commit no Git
- Use a mesma chave em produção

#### 🌐 Google OAuth

1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Vá para "APIs & Services" > "Credentials"
3. Crie "OAuth 2.0 Client IDs"
4. Configure:
   - **iOS**: Bundle ID = `com.jarvi.app`
   - **Android**: Package name = `com.jarvi.app`
5. Copie o Client ID para o `.env`

### 3. Executar o Backend

```bash
npm run dev
```

### 4. Verificar Funcionamento

```bash
curl http://localhost:3001/health
```

Deve retornar: `{"status":"OK","timestamp":"..."}`

## 🚀 Produção

Para produção:

1. **Gere nova JWT_SECRET**
2. **Configure FRONTEND_ORIGINS** para seu domínio
3. **Use PostgreSQL** ao invés de SQLite
4. **Configure HTTPS**

## 🔒 Segurança

- ✅ JWT com chave segura
- ✅ CORS configurado
- ✅ Middleware de autenticação
- ✅ Validação de entrada
- ✅ Rate limiting (recomendado para produção)

## 📝 Variáveis de Ambiente

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `PORT` | Porta do servidor | `3001` |
| `NODE_ENV` | Ambiente | `development` |
| `JWT_SECRET` | Chave JWT | `[64 chars hex]` |
| `JWT_EXPIRES_IN` | Expiração do JWT | `7d` |
| `GOOGLE_CLIENT_ID` | Google OAuth ID | `123...googleusercontent.com` |
| `FRONTEND_ORIGINS` | Origens permitidas para CORS (separadas por vírgula) | `https://app.jarvi.life` |
| `FRONTEND_URL` | Origem do frontend para Socket.IO | `https://app.jarvi.life` |
| `APP_URL` | URL base usada em links de e-mail | `https://app.jarvi.life` |
| `STRIPE_SECRET_KEY` | Chave secreta Stripe | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | Secret do webhook | `whsec_...` |
| `STRIPE_PRICE_ID` | ID do preço/produto | `price_...` |

## 💳 Stripe - Configuração de Pagamentos

### 1. Criar Produto no Stripe

1. Acesse [dashboard.stripe.com](https://dashboard.stripe.com)
2. Vá em **Products** → **Add product**
3. Configure:
   - **Name**: Jarvi Pro
   - **Price**: R$ 29,00/mês (ou seu valor)
4. Copie o **Price ID** (`price_...`)

### 2. Obter API Keys

1. Vá em **Developers** → **API keys**
2. Copie:
   - **Secret key** (`sk_test_...`) → para o backend
   - **Publishable key** (`pk_test_...`) → para o frontend

### 3. Configurar Webhook (Produção)

1. Vá em **Developers** → **Webhooks** → **Add endpoint**
2. **URL**: `https://seu-backend.com/webhooks/stripe`
3. **Events**:
   - `checkout.session.completed` (necessário para Payment Links/Checkout)
   - `customer.subscription.trial_will_end`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copie o **Webhook signing secret** (`whsec_...`)

### 4. Desenvolvimento Local com Stripe CLI

Para receber webhooks localmente, use o Stripe CLI:

```bash
# Setup inicial (instala CLI e faz login)
npm run stripe:setup

# Iniciar listener de webhooks
npm run stripe:listen
```

O CLI vai mostrar um `whsec_` temporário - use no seu `.env` local.

**Comando completo para desenvolvimento:**

```bash
# Roda backend + frontend + webhook listener
npm run dev:stripe
```

### 5. Testar Eventos

```bash
npm run stripe:trigger:trial-end       # Fim do trial (3 dias antes)
npm run stripe:trigger:payment-success # Pagamento OK
npm run stripe:trigger:payment-failed  # Pagamento falhou
```

### 6. Cartões de Teste

| Cenário | Número do Cartão |
|---------|------------------|
| ✅ Sucesso | `4242 4242 4242 4242` |
| ❌ Recusado | `4000 0000 0000 0002` |
| 🔐 Autenticação 3DS | `4000 0025 0000 3155` |

Use qualquer data futura e CVC de 3 dígitos.

📚 Mais detalhes: [docs/STRIPE_SETUP.md](../../docs/STRIPE_SETUP.md)










