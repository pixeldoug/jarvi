# Verificação diária do sistema

Playbook da checagem de produção da Jarvi. Qualquer agente (local ou Cloud) segue este arquivo — a skill em `.cursor/skills/bug-investigator/` só aponta para cá.

Gatilhos no chat: “verificação diária”, “controle diário”, “rodar o controle diário”.

Automação Cursor: dias úteis **8:30 BRT** (`30 11 * * 1-5` UTC), canal Slack `#jarvi-security`.

## Alvos

| Superfície | URL |
|------------|-----|
| API produção | `https://jarvi-production.up.railway.app` |
| API staging | `https://jarvi-staging.up.railway.app` |
| Marketing | `https://jarvi.life` |
| App | `https://app.jarvi.life` |
| Issue-mãe | [JAR-23](https://linear.app/strides/issue/JAR-23/bugbash-findings) |
| Slack | `#jarvi-security` (`C0APX3VJ2UU`) |

Checkout na nuvem = `origin/main`. Run local pode cruzar com o working tree; patches só na máquina **não** contam como corrigidos em produção.

## Roteiro

### 1. Sondas públicas (sem senha)

```bash
node scripts/daily-system-check.mjs --out=scripts/bugbash-issues/_daily-last.json
```

O script cobre:

- `GET /health`
- `GET /debug/notes-table` e variantes (`/debug`, `/debug/users`, `/.env`, `/api/debug`)
- Landing: CTA “acesso antecipado”, typo “voce”, `GET /early-access`
- Homepage do GitHub `pixeldoug/jarvi`
- Bundle de `app.jarvi.life` contém `localhost:3001`?

Não precisa de credencial. `JARVI_INSECURE_TLS=1` se o Node falhar o certificado Railway.

### 2. Runner autenticado

```bash
# PowerShell
$env:JARVI_API_URL="https://jarvi-production.up.railway.app"
$env:JARVI_INSECURE_TLS="1"
# JARVI_EMAIL / JARVI_PASSWORD ou JARVI_TOKEN — nunca no git
node .cursor/skills/bug-investigator/scripts/investigate.mjs --out=scripts/bugbash-issues/_last-run.json
```

- Login 401/falha → sondas autenticadas **skip**, não pass.
- `403 subscription_required` → skip CRUD, não pass.
- Prefixo de dados `[bug-inv]` — limpar no fim (o runner já faz).
- Matriz de sondas: [`.cursor/skills/bug-investigator/reference.md`](../.cursor/skills/bug-investigator/reference.md).

### 3. Caça (código + URLs)

Em paralelo ao runner:

- Rotas sem `authenticateToken`, endpoints `/debug`, `dangerouslySetInnerHTML`, `catch` que devolve 500, mass assignment, paywall bypass.
- PRs abertos em `pixeldoug/jarvi` (ex.: #35 segurança, #36 P2, #37 UX) — só citar status, não mergear.
- Deduplicar contra JAR-23 e `scripts/bugbash-issues/`. Sem hipótese: só o que reproduziu nesta corrida.
- Subagentes Grok / Bugbot **se o runtime tiver**. Senão a auditoria no checkout basta.

### 4. Linear

Time **Jarvi**, milestone **Bugbash**, mãe **JAR-23**, label **Bug**.

- Ainda falha em prod: comentário de revalidação (data + evidência). Se estava Done, reabrir para **Todo**.
- Patch só no working tree / PR aberto: comentar “corrigido no código, aguarda deploy”; **não** marcar Done de novo.
- Achado **novo e reproduzível**: issue nova, título com prefixo `[bugbash]`, template em [`.cursor/skills/bug-investigator/issue-template.md`](../.cursor/skills/bug-investigator/issue-template.md). Prioridade: P0 → Urgent (1), P1 → High (2), P2 → Medium (3), P3 → Low (4).
- Atualizar o índice de JAR-23 (snapshot da data).

Se Linear não estiver ligado (Cloud Agent sem MCP): listar os tickets só no Slack.

### 5. Slack

Canal `#jarvi-security` (`C0APX3VJ2UU`). Resumo no canal + detalhes na thread.

**Se nada mudou** (P0/P1 conhecidos ainda no ar, sem fail novo):

```
*Verificação diária Jarvi* · YYYY-MM-DD
Sem regressão. P0 <https://linear.app/strides/issue/JAR-24/…|JAR-24> debug ainda público. Índice: <https://linear.app/strides/issue/JAR-23/bugbash-findings|JAR-23>
```

**Se mudou ou há fail novo:** bloco canal com contagem (ainda no ar / novos / PRs) e thread com um item por achado — Detectado / Esperado / Atual + link Linear. Formato de referência: `scripts/bugbash-issues/slack-p0-p1.md`.

Não repetir o novelão da rodada anterior quando o estado for o mesmo.

## Skip / não fazer

- Não inventar bug. Não abrir ticket duplicado.
- Não commitar `.env`, tokens, nem scripts com senha (JAR-48).
- Não explorar além do escopo Jarvi.
- Não mergear PRs (esta conta costuma não ter write em `pixeldoug/jarvi`).
- Não autenticar PostHog/Vercel só para esta checagem.
- Sondas autenticadas puladas **não** entram no total de pass.

## Segredos (Cloud Agent / máquina local)

Só env, nunca git:

- `JARVI_EMAIL` / `JARVI_PASSWORD` ou `JARVI_TOKEN`
- `JARVI_INSECURE_TLS=1` (Railway + Node)

Se o login de teste falhar, a checagem pública + caça no código ainda valem; CRUD fica skip até a conta funcionar.

## Primeira prova

Rodar os dois scripts contra produção, atualizar JAR-23, postar no Slack. A automação Cursor só dispara sozinha depois de salva no editor (compute de Cloud Agent ligado).
