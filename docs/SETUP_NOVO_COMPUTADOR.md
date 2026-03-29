# Configuração do projeto em outro computador

Guia para continuar desenvolvendo o Jarvi em uma máquina nova (clone do repositório ou máquina limpa).

---

## 1. Clone e dependências

```bash
git clone <url-do-repo> jarvi
cd jarvi
npm run install:all
npm run build:shared
```

Requisitos: **Node.js 18+** e **npm 9+**.

---

## 2. Variáveis de ambiente (.env)

Os arquivos `.env` **não vão para o Git** (estão no `.gitignore`). No novo computador é preciso **criar de novo** ou copiar do computador antigo por um canal seguro (1Password, envio criptografado, etc.).

### Onde criar

| Onde      | Arquivo                         | Uso           |
|-----------|----------------------------------|---------------|
| Backend   | `packages/backend/.env`         | API           |
| Web       | `packages/web/.env` ou `.env.local` | App React (Vite) |
| Mobile    | `packages/mobile/.env`          | App mobile (se usar) |

### Backend (`packages/backend/.env`)

| Variável               | Obrigatório | Descrição / exemplo |
|------------------------|------------|----------------------|
| `PORT`                 | Não        | Porta do servidor, ex.: `3001` |
| `NODE_ENV`             | Não        | Ex.: `development` |
| `JWT_SECRET`           | **Sim**    | Chave para JWT. Gerar: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_EXPIRES_IN`       | Não        | Ex.: `7d` |
| `GOOGLE_CLIENT_ID`     | Sim (auth) | Client ID OAuth "Web" do Google Cloud |
| `GOOGLE_MOBILE_CLIENT_ID` | Não     | Client ID OAuth iOS/Android (se usar mobile) |
| `DATABASE_URL`         | Não        | Padrão: `sqlite:./jarvi.db` |
| `APP_URL`              | Não        | URL do front (emails). Padrão: `http://localhost:5173` |
| `RESEND_API_KEY`       | Sim (emails) | Chave Resend (verificação de email e reset de senha) |
| `STRIPE_SECRET_KEY`    | Se usar Stripe | Chave secreta Stripe |
| `STRIPE_WEBHOOK_SECRET`| Se usar Stripe | Webhook signing secret |
| `STRIPE_PRICE_ID`      | Se usar Stripe | ID do preço do produto |

### Web (`packages/web/.env` ou `packages/web/.env.local`)

| Variável                      | Obrigatório | Descrição / exemplo |
|------------------------------|------------|----------------------|
| `VITE_API_URL`               | Não        | Ex.: `http://localhost:3001` |
| `VITE_GOOGLE_CLIENT_ID`      | Sim (auth) | Mesmo Client ID "Web" do Google |
| `VITE_STRIPE_PUBLISHABLE_KEY`| Se usar Stripe | Chave pública Stripe |
| `VITE_PUBLIC_POSTHOG_KEY`    | Não        | Analytics (PostHog) |

### Mobile (`packages/mobile/.env`)

Usar as mesmas credenciais Google OAuth (Client IDs mobile). Ver `packages/mobile/env.example` se existir.

---

## 3. Banco de dados

- Os arquivos `*.db` estão no `.gitignore` e **não vêm no clone**.
- Ao subir o backend no novo PC, um novo SQLite será criado (ex.: `packages/backend/jarvi.db`).
- Se quiser **os mesmos dados** do computador antigo: copie o arquivo `packages/backend/jarvi.db` do PC antigo para o mesmo caminho no novo (por canal seguro).

---

## 4. Google OAuth

- Pode usar o **mesmo projeto** do Google Cloud nos dois computadores.
- Basta colocar os **mesmos Client IDs** nos `.env` (backend e web). Não é necessário criar novo projeto.

---

## 5. Stripe (desenvolvimento local)

- Se usar webhooks em dev: instalar o **Stripe CLI** no novo PC.
- Rodar o listener (ex.: `stripe listen` ou script do projeto) e colocar o **Webhook signing secret** temporário no `packages/backend/.env` como `STRIPE_WEBHOOK_SECRET`.
- Ver `docs/STRIPE_SETUP.md` para detalhes.

---

## 6. Resend (emails)

- A mesma `RESEND_API_KEY` pode ser usada em todos os computadores.
- Basta definir `RESEND_API_KEY` no `packages/backend/.env` do novo PC.

---

## 7. Git no novo computador

- Configurar identidade: `git config user.name` e `git config user.email`.
- Se não for usar assinatura GPG: `git config commit.gpgsign false` (evita erro "cannot run gpg").

---

## 8. Checklist rápido

1. [ ] Clone do repositório e `cd` na pasta do projeto.
2. [ ] `npm run install:all` e `npm run build:shared`.
3. [ ] Criar `packages/backend/.env` com as variáveis necessárias (incluindo `JWT_SECRET` e OAuth/Resend/Stripe conforme uso).
4. [ ] Criar `packages/web/.env` ou `.env.local` com `VITE_API_URL` e `VITE_GOOGLE_CLIENT_ID` (e Stripe/PostHog se usar).
5. [ ] (Opcional) Copiar `packages/backend/jarvi.db` do computador antigo se quiser os mesmos dados.
6. [ ] (Opcional) Configurar Stripe CLI e webhook secret no backend se for testar pagamentos em dev.
7. [ ] Rodar `npm run dev:all` (ou `dev:backend` + `dev:web`) e testar login e fluxos de email/Stripe.

---

## Referências no repositório

- `README.md` – visão geral e quick start.
- `packages/backend/SETUP.md` – backend e variáveis de ambiente.
- `docs/STRIPE_SETUP.md` – Stripe e webhooks.
