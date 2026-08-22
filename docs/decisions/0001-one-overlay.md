# 0001 — Um overlay por vez

**Status:** aceita  
**Superfície:** web (`packages/web`)  
**Contrato:** [packages/web/compliance.md](../../packages/web/compliance.md)

## Contexto

Em Settings (**Minha Conta**), o fluxo **Alterar senha** abre um segundo `Dialog` em cima do primeiro. O usuário vê três camadas: o app, o modal de conta escurecido, e o modal de senha. O mesmo padrão existe para desconectar Google e excluir conta.

Dois backdrops empilhados tiram contexto, duplicam Escape/clique-fora e deixam a hierarquia confusa.

## Decisão

No app web, **no máximo um** overlay de `Dialog` visível. Sem segundo portal “por cima” de propósito.

Caminhos válidos:

1. **Replace:** fecha o Dialog pai, abre o filho; ao fechar o filho, reabre o pai se ainda fizer sentido.
2. **Mesmo Dialog:** troca o conteúdo (passo / view) dentro do overlay que já está aberto.

## Alternativas consideradas

- Empilhar com backdrop mais fraco no de baixo — ainda são dois modais; rejeitada.
- Sheet / drawer só para o filho — no web o primitive canônico de fluxo modal continua sendo `Dialog`; não inventar um terceiro overlay type para contornar a regra.

## Consequência

Settings usa **replace** (Minha Conta / sheet mobile some, o filho abre, ao fechar o filho a conta volta). Ver `Sidebar` + `ProfilePage`.

Marketing e mobile **não** herdam esta cláusula: overlays lá (landing, sheets nativos) têm contrato próprio, ainda stub.
