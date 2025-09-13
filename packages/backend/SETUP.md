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
2. **Configure CORS_ORIGIN** para seu domínio
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
| `CORS_ORIGIN` | Origem permitida | `http://localhost:3000` |






