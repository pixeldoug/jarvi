# Marca e voz

**Quem lê:** time e AI escrevendo copy visível ao usuário (web, marketing, mobile), não CSS.

**O que não entra aqui:** paleta, tipografia, `var(--…)`, qual `Button` usar. Tokens e componentes: [design system web](../../packages/web/src/design-system/README.md) e [packages/web/compliance.md](../../packages/web/compliance.md).

## Tom (demo)

- Produto em **PT-BR**.
- Frases curtas, diretas; o usuário está tentando fazer uma tarefa, não ler um manifesto.
- Evitar jargão interno (“overlay”, “token semântico”) na UI. Isso fica no handbook e no compliance.

## Brand vs implementação

| Brand (este arquivo) | Implementação |
|----------------------|----------------|
| Como a Jarvi fala | Como a Jarvi *desenha* aquele app |
| Vale em todas as superfícies | `compliance.md` + design system da superfície |

Quando a voz conflitar com um ban de UI (ex. um segundo modal “só para o texto caber”), vale o **compliance** da superfície; ajuste o copy no mesmo overlay.
