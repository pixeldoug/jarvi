---
name: bug-investigator
description: >-
  Investiga bugs no Jarvi de ponta a ponta — API, auth/acesso, IDOR, validação,
  XSS/injeção, UX e vulnerabilidades. Use quando o usuário pedir bugbash,
  caça a bugs, auditoria de estabilidade, investigação de vulnerabilidade,
  experiência ruim causada por edge cases, verificação diária, controle diário,
  ou checagem de produção (jarvi.life / API Railway).
---

# Bug Investigator (Jarvi)

Metodologia + runner para encontrar instabilidade, falhas de acesso e UX ruim.

## Quando usar
- "caça bugs", "bugbash", "investigar vulnerabilidades"
- "testar edge cases", "bugs que o usuário pode causar"
- revisão pré-release de estabilidade / segurança
- **"verificação diária"**, **"controle diário"**, **"rodar o controle diário"** — seguir o [runbook](../../../docs/DAILY_SYSTEM_CHECK_RUNBOOK.md), não improvisar.

## Fluxo (obrigatório)

1. **Ler** [reference.md](reference.md) (matriz de sondas + severidade).
2. **Rodar** o runner automatizado (API/acesso/validação):

```bash
# Local (padrão)
node .cursor/skills/bug-investigator/scripts/investigate.mjs

# Produção / staging (Windows PowerShell)
$env:JARVI_API_URL="https://jarvi-production.up.railway.app"
$env:JARVI_EMAIL="..."
$env:JARVI_PASSWORD="..."
$env:JARVI_INSECURE_TLS="1"   # se Node falhar com UNABLE_TO_VERIFY_LEAF_SIGNATURE
node .cursor/skills/bug-investigator/scripts/investigate.mjs --out=scripts/bugbash-issues/_last-run.json
```

3. **Expandir manualmente** o que o runner marcar `needs_manual` (browser/CDP/UI).
4. **Auditoria de código** paralela: rotas sem `authenticateToken`, `dangerouslySetInnerHTML`, debug endpoints, mass assignment, `catch` que devolve 500 genérico.
5. **Documentar** cada finding real com o template em [issue-template.md](issue-template.md) em `scripts/bugbash-issues/NN-slug.md`.
6. **Arquivar** só bugs reproduzíveis (não hipóteses). Preferir Linear team **Jarvi** ou `gh issue` com label `bug` + prefixo `[bugbash]`.

## Categorias a cobrir (sempre)

| Categoria | Foco |
|-----------|------|
| `access` | Rotas sem auth, JWT inválido/expirado, subscription bypass |
| `idor` | Ler/editar/apagar recurso de outro user |
| `validation` | Inputs vazios, enormes, tipos errados, datas inválidas → deve ser 4xx, nunca 500 |
| `injection` | XSS armazenado, HTML cru, unicode/controle, payloads SQL-like |
| `auth` | Enumeração de email, reset/forgot, OTP, rate limit |
| `ux` | Toggles quebrados, estados inconsistentes, copy errada, rotas 404 |
| `exposure` | Debug endpoints, stack traces, schema/counts públicos |
| `stability` | Payloads grandes, concorrência, campos extras (mass assignment) |

## Regras
- Prefixo de dados de teste: `[bug-inv]` — limpar ao final.
- Nunca hardcodar senha/token no repo; usar `JARVI_EMAIL` / `JARVI_PASSWORD` / `JARVI_TOKEN`.
- Não explorar além do escopo Jarvi (não atacar terceiros).
- Severidade: **P0** (exposição/auth break), **P1** (dados/XSS/IDOR), **P2** (500/validação), **P3** (UX/copy).
- Deduplicar contra issues já em `scripts/bugbash-issues/` e Linear/GitHub antes de abrir nova.

## Após o runner
Para cada finding com `verdict: fail`:
1. Confirmar com 1 request mínimo reproduzível.
2. Localizar código (`packages/backend` / `packages/web`).
3. Escrever issue no template (linguagem simples + steps + esperado/atual).
4. Opcional: abrir no Linear (team Jarvi) ou GitHub.

## Controle diário

Quando o pedido for verificação / controle diário do sistema, **não** faça só o bugbash pontual. Siga [docs/DAILY_SYSTEM_CHECK_RUNBOOK.md](../../../docs/DAILY_SYSTEM_CHECK_RUNBOOK.md) na ordem:

1. Sondas públicas: `node scripts/daily-system-check.mjs --out=scripts/bugbash-issues/_daily-last.json`
2. Runner de produção (`investigate.mjs`) com env — login falhou = skip autenticado, não pass.
3. Caça no código + URLs; Grok/Bugbot só se o runtime tiver subagente.
4. Linear: revalidar filhas de JAR-23; issue nova só se for reproduzível e ainda não existir.
5. Slack `#jarvi-security` (`C0APX3VJ2UU`): se nada mudou, uma linha; senão resumo + thread.

Automação agendada (dias úteis 8:30 BRT) usa o mesmo roteiro. Checkout na nuvem é `main`; working tree local não é produção.
