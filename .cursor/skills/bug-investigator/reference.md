# Bug Investigator — referência

## Ambientes

| Alias | URL |
|-------|-----|
| local | `http://localhost:3001` |
| staging | `https://jarvi-staging.up.railway.app` |
| prod | `https://jarvi-production.up.railway.app` |
| web | `http://localhost:3000` / app de produção |

Auth de teste: `POST /api/auth/login` → JWT. Token também via `JARVI_TOKEN`.

## Superfície de API (checklist)

| Prefixo | Auth? | Notas |
|---------|-------|-------|
| `GET /health` | não | OK público |
| `GET /debug/*` | deve exigir auth/admin | **exposure** se aberto |
| `/api/auth/*` | misto | login/register/forgot públicos |
| `/api/tasks` | sim + subscription | CRUD + toggle |
| `/api/notes` | sim | conteúdo HTML? |
| `/api/categories` | sim + subscription | delete edge cases |
| `/api/lists` | sim | |
| `/api/subscriptions/*` | sim | cancel/extend/portal |
| `/api/users/*` | sim | profile, password, delete me |
| `/api/users/search` | sim | **enumeration** |
| `/api/early-access` | não | spam/abuse |
| `/api/ai/chat` | sim | custo / prompt injection |
| `/api/gmail/*` | misto | callback público |
| `/api/webhooks/*` | assinatura? | WhatsApp/voice |
| share routes | sim | IDOR em shares |

## Matriz de sondas (runner)

### access
- `GET` protegido sem token → 401
- token lixo / expirado → 401
- `Authorization: Bearer` vazio → 401

### idor
- `PUT/DELETE /api/tasks/:foreignId` → 403/404 (não 200)
- idem notes/categories
- mass assignment: body com `user_id` de outro → deve ignorar

### validation
- title `""`, `"   "`, só `\n`, 10k chars
- `priority` inválida (`"ultra"`, `1`, `null`)
- `dueDate` inválida (`"not-a-date"`, `"2026-13-40"`)
- body não-JSON / content-type errado
- Esperado: **400**; **500 = bug**

### injection
- title/content com `<script>`, `onerror=`, `javascript:`
- SQL-like: `' OR 1=1 --`
- unicode: RTL override `\u202E`, ZWSP `\u200B`

### auth
- login email inexistente vs senha errada (mensagens/timing)
- `forgot-password` com email aleatório (não vazar existência)
- `/api/users/search?q=` curto (enumeração)

### exposure
- `/debug/notes-table` e variantes
- respostas com `stack`, `sql`, paths absolutos

### stability
- body ~1–2MB (limite declarado 75mb — cuidado)
- campos extras inesperados
- double-submit create + toggle rápido

### ux (manual / browser)
- toggle "criar tarefa" não persiste
- completed aparece em seções de data
- rotas marketing/web erradas (homepage, early-access copy)
- finances / Tailwind quebrado
- collab apontando para localhost

## Severidade

| Sev | Critério |
|-----|----------|
| P0 | Acesso sem auth a dados/schema; bypass de auth |
| P1 | IDOR, XSS explorável, enumeração de usuários, leak de PII |
| P2 | 500 em input inválido, validação ausente, estado inconsistente API |
| P3 | Copy, layout, UX confusa sem perda de dados |

## Saída do runner

JSON em `--out` com:

```json
{
  "meta": { "api": "...", "at": "ISO", "passed": 0, "failed": 0 },
  "findings": [
    {
      "id": "validation.dueDate-invalid",
      "category": "validation",
      "severity": "fail",
      "severity": "P2",
      "title": "...",
      "evidence": { "status": 500, "body": "..." },
      "repro": { "method": "POST", "path": "/api/tasks", "body": {} }
    }
  ]
}
```

`verdict`: `pass` | `fail` | `needs_manual` | `skip`
