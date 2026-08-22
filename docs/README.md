# Documentação da Jarvi

Este diretório é o **handbook**: o que a Jarvi é e por que decidimos X. Qualquer pessoa e qualquer orquestrador de AI leem Markdown aqui — não depende de Cursor, `.mdc` ou skills.

Humanos podem abrir o mesmo conteúdo como site interno: `npm run dev:handbook` (porta 3003). O site é só uma view; estes arquivos continuam a fonte da verdade.

Há um segundo tipo de documento, **fora** desta pasta: o contrato de implementação de cada app.

## Regra de ouro

| Onde | Responde | Exemplo |
|------|----------|---------|
| `docs/` | O que o produto é e **por que** | “Não empilhamos overlay porque perde contexto” |
| `packages/<app>/compliance.md` | **Como** implementar **aquele** app | “Nunca dois `Dialog` abertos no web” |

Não misturar. Uma decisão de produto pode viver em `docs/decisions/`; a cláusula must/must-not (componentes, grep, nomes de arquivo) vive no `compliance.md` da superfície que ela afeta.

## Como a AI deve navegar

1. [AGENTS.md](../AGENTS.md) na raiz — mapa e setup do monorepo.
2. Este README — escolher a pasta certa.
3. Se for **código de UI**, o `compliance.md` do package (`web`, `marketing` ou `mobile`). Não aplicar regras de Dialog do web no marketing ou no mobile.

Doutrina de tokens (web): [packages/web/src/design-system/README.md](../packages/web/src/design-system/README.md).

## Mapa desta árvore

| Pasta / arquivo | Propósito | Exemplo | O que não colocar |
|-----------------|-----------|---------|-------------------|
| [product/](product/) | O que a Jarvi é (superfícies, job do produto) | App de tarefas; web + marketing + mobile | Spec de componente, bans de CSS |
| [decisions/](decisions/) | ADRs — por que uma decisão existe | Um overlay por vez | “Importe `Dialog` de `components/ui`” |
| [brand/](brand/) | Voz e tom (cross-surface) | PT-BR direto, sem jargão de design system | Paleta, `var(--…)`, Button vs Ghost |
| `ARCHITECTURE.md`, `*_RUNBOOK.md`, `STRIPE_SETUP.md`, `PRODUCTION_PLAN.md`, `SETUP_NOVO_COMPUTADOR.md`, `WHATSAPP_TASKS.md` | Ops / engenharia **já existentes** — ficam na raiz de `docs/` neste passo | Como subir WhatsApp em produção | Contrato de UI |

Arquivos de ops **não foram movidos**. Quando fizer sentido, podem ir para algo como `docs/ops/`; até lá, trate-os como engenharia, não como produto.

## Contratos por superfície

| Superfície | Contrato |
|------------|----------|
| Web (`packages/web`) | [packages/web/compliance.md](../packages/web/compliance.md) |
| Marketing (`packages/marketing`) | [packages/marketing/compliance.md](../packages/marketing/compliance.md) |
| Mobile (`packages/mobile`) | [packages/mobile/compliance.md](../packages/mobile/compliance.md) |

Marketing e mobile ainda são **stubs**: explicam o arquivo. Não copiar bans do web para eles.
