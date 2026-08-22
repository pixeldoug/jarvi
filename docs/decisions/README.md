# Decisões (ADRs)

**Quem lê:** time e AI que precisam do **porquê** de uma regra, sem o detalhe de implementação.

Um ADR (Architecture Decision Record) aqui é curto: contexto, decisão, alternativas, consequência.

## Relação com compliance

| Aqui (`docs/decisions/`) | No package (`compliance.md`) |
|--------------------------|------------------------------|
| Por que existe a regra | Must / must-not, componentes, violações conhecidas |
| Vale citar em mais de uma superfície | Só a superfície que implementa |

Se a AI for **escrever UI**, o contrato do package manda. O ADR explica; não substitui o ban.

## Índice

| ID | Decisão | Superfície |
|----|---------|------------|
| [0001](0001-one-overlay.md) | Um overlay por vez (não empilhar Dialog) | Web |
