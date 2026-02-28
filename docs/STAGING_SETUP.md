# Staging Setup (Jarvi)

Guia rápido para operar staging sem afetar produção.

## Estrutura recomendada

- `main` -> produção
- `staging` (ou `feat/staging-*` + merge em `staging`) -> staging

## Backend (Railway)

Crie um serviço separado para staging, com banco PostgreSQL separado de produção.

Variáveis mínimas:

```bash
NODE_ENV=production
APP_ENV=staging
DATABASE_URL=postgresql://...
JWT_SECRET=...
OPENAI_API_KEY=...
APP_URL=https://staging.jarvi.life
CORS_ALLOWED_ORIGINS=https://staging.jarvi.life,https://www.staging.jarvi.life
ALLOWED_EXTENSION_IDS=<id_extensao_staging_1>,<id_extensao_staging_2>
```

## Web (Vercel)

- Ambiente preview/staging apontando para API de staging.
- Exemplo:

```bash
VITE_API_URL=https://api-staging.jarvi.life
VITE_APP_NAME=Jarvi (Staging)
```

## Extensão Chrome

No popup da extensão:

1. Selecione preset `Staging`
2. Clique `Save`
3. Configure o JWT de usuário de staging
4. Clique `Test auth`

## Validação rápida

- `GET /health` da API de staging responde `OK`
- login funciona na web staging
- fluxo Gmail -> pending task -> confirmar task funciona no staging

## Promoção para produção

Após aprovação em staging:

1. PR `staging -> main`
2. Deploy de produção
3. Smoke test em produção
