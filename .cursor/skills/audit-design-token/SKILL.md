---
name: audit-design-token
description: Audita um design token da Jarvi nos pacotes web e marketing — lista usos via var(), encontra valores hardcoded equivalentes (candidatos a migração) e gera snapshots visuais via Storybook. Use ao revisar tokens de tipografia, cor ou espaçamento, planejar mudanças de escala (ex.: tamanhos mobile), ou caçar valores hardcoded que deveriam usar um token.
---

# Audit Design Token

Audita um único design token de ponta a ponta: inventário de uso + candidatos hardcoded + snapshot visual.

## Quando usar
- "quantas instâncias usam <token>?"
- "onde <token> está hardcoded?"
- "quero um snapshot visual de onde <token> aparece"
- planejamento de escala responsiva / migração de token.

## Estágio A — Inventário (rodar sempre)

Execute o script com o nome do token (família de tipografia, token semântico de cor, ou spacing/radius):

```bash
node .cursor/skills/audit-design-token/scripts/find-token-usages.mjs body-lg
```

Por padrão audita os escopos `web` (`packages/web/src`) e `marketing` (`packages/marketing`). Restrinja com `--scope`:

```bash
node .cursor/skills/audit-design-token/scripts/find-token-usages.mjs display-lg --scope=web
node .cursor/skills/audit-design-token/scripts/find-token-usages.mjs display-lg --scope=web,marketing
```

`mobile` e `shared` ficam fora por enquanto (não estão em `SCOPE_ROOTS`).

Saída em markdown, separando:
- **Usos diretos** (`var(--...)`)
- **Candidatos hardcoded** (valor bate com o token, mas não usa a var)
- **Matches parciais** (algumas propriedades batem — revisar; ex.: só o weight difere)
- **Inline em `.tsx`** (candidatos secundários)

Resolva sempre o valor a partir de `packages/web/src/design-system/tokens/css-variables.css` (fonte canônica); nunca assuma o valor. O `marketing` espelha alguns vars no seu `globals.css`, mas a resolução continua sendo a do web.

## Estágio B — Snapshot visual

Captura unificada **web + marketing** via Playwright contra os apps rodando (consome o `--json` do Estágio A e descobre os elementos via DOM):

```bash
npm run audit:snap -- display-lg --scope=web,marketing
# = node .cursor/skills/audit-design-token/scripts/capture-snapshots.mjs display-lg --scope=web,marketing
```

PNGs em `.audit-snapshots/<token>/` (1 por rota, full-page, elementos destacados: sólido = direto/hardcoded, tracejado = parcial) + `index.md`. Requer servidores rodando (`dev:marketing` / `dev:web`) e, para rotas autenticadas do web, um JWT (`--jwt=<token>` ou env `JARVI_AUDIT_TOKEN`). Detalhes, pré-requisitos e o manifesto de rotas em [reference.md](reference.md).

## Regras
- Trate definição do token, `scripts/generate-tokens.js`, `*.tokens.json`, `.md` e blocos comentados como NÃO-usos (o script já ignora).
- Para tipografia, "match exato" exige font-size + line-height + weight + letter-spacing batendo; matches parciais vão para seção separada.
- O `line-height` é normalizado para px antes de comparar: o script resolve valores unitless / `%` / `em` usando o `font-size` do mesmo bloco (ex.: `line-height: 1.0667` com `font-size: 60px` ≡ `64px`). Há tolerância de ~0.6px / 0.02 de razão para arredondamentos.
- Sempre cheque estilos inline em `.tsx` (`fontSize`, etc.) como candidatos secundários.
- "0 ocorrências" é relativo ao escopo auditado, não ao monorepo inteiro — o script emite um aviso explícito quando o resultado é vazio. Reescaneie com `--scope` antes de tratar um token como morto.
- O parser de CSS é proposital­mente simples (cobre bem `*.module.css`); valide a saída ao auditar tokens novos.
