# 0006 — A descrição de uma tarefa não perde o que já diz quando a IA atualiza

**Superfície:** agente (web + WhatsApp) + web (Tarefas) · **Status:** em vigor

## Contexto

Uma tarefa evolui: a pessoa volta ao chat dela várias vezes e conta o que aconteceu. A descrição é onde isso fica registrado (`## Contexto`, uma seção de atualizações, `## Próximos passos`).

A IA atualiza a descrição enviando o texto inteiro de novo. O prompt pedia para preservar os fatos, mas nada no código garantia: em 19/11/2026 uma atualização trocou o contexto de uma tarefa pelo status do momento, e o que estava lá sumiu. Não havia como recuperar.

## Decisão

1. **A descrição só cresce quando quem escreve é a IA.** Antes de salvar, o backend compara o texto que estava salvo com o que a IA enviou. Toda linha que sumiu volta, numa seção `## Histórico` (criada antes de `## Próximos passos` se não existir). A resposta no chat não muda.
2. **Uma linha conta como mantida quando a informação continua lá**, mesmo com outras palavras: os números, datas e códigos dela aparecem no texto novo, e a maior parte das palavras está numa linha (ou espalhada pelo texto, se a linha foi dividida). Um número ou código que some é informação que some, e isso inclui códigos curtos em maiúsculas ("OE" virar "UE" é outra informação).
3. **`## Próximos passos` fica de fora.** Listas do que falta fazer (e qualquer checkbox) são reescritas a cada atualização; é para isso que servem.
4. **Apagar exige o pedido da pessoa.** A IA só remove, encurta ou reescreve o que já está registrado quando marca que o usuário pediu (`user_asked_to_remove`) **e** a mensagem do usuário tem uma palavra que pede isso ("apaga", "tira", "reescreve", "corrige"…). A marca do modelo sozinha não basta, pelo mesmo motivo da [0002](0002-backend-owned-confirmations.md): o que o modelo afirma precisa de lastro no que a pessoa escreveu. Limpar a descrição inteira segue a mesma regra.
5. **O que a pessoa edita à mão não passa por isso.** A regra vale para escritas da IA; o editor da tarefa continua livre.
6. **Toda alteração da IA guarda a versão anterior.** Antes de a IA (no chat, no WhatsApp ou por um app conectado via MCP) trocar a descrição, o texto que estava lá fica guardado, sem os anexos. A tarefa ganha o botão **Versões anteriores**: a pessoa lê cada versão e restaura a que quiser. Restaurar guarda o texto atual também (mesmo quando a descrição estava vazia), então dá para desfazer. Se a descrição for salva em outro lugar enquanto a restauração acontece, a restauração recomeça a partir desse texto mais novo, que também fica guardado. Ficam as 20 mais recentes por tarefa. É a rede para o que a trava não cobre (uma reescrita pedida pela pessoa, um erro do modelo dentro das regras).
7. **O prompt pede o comportamento certo de saída:** copiar as linhas que já existem como estão, registrar a novidade como linha nova e datada, e tratar `## Contexto` como pano de fundo, não como status do momento. A trava do item 1 e as versões do item 6 são a garantia para quando o modelo não segue.

## Alternativas descartadas

- **Só reforçar o prompt.** Já era pedido e falhou; uma instrução não é garantia.
- **Recusar a escrita e pedir para o modelo refazer.** Custa uma chamada a mais por turno e pode falhar de novo. Devolver as linhas resolve em uma passada e nunca perde nada.
- **Devolver a linha para a seção de onde saiu.** Ao lado do texto novo, a linha antiga pode contradizer o estado atual ("ainda não ligou" junto de "aguardando retorno"). Em `## Histórico` fica claro que é registro do que já foi.
- **Só o histórico de versões, sem a trava.** Resolve a recuperação, mas não evita a perda nem deixa o histórico à vista na tarefa: a pessoa teria de perceber que algo sumiu e ir buscar. As duas coisas ficam juntas.
- **Guardar versão também do que a pessoa digita.** O editor salva sozinho a cada pausa; cada pausa viraria uma versão.

## Consequência

- Um falso positivo (linha mantida com palavras muito diferentes, ou uma data reescrita em outro formato) deixa uma linha repetida em `## Histórico`. O erro vai para o lado seguro: sobra texto, não falta.
- No chat geral a IA só vê o começo de uma descrição longa. Se ela reescrever a partir disso, o restante vai inteiro para `## Histórico`: nada se perde, mas o texto fica menos organizado. As edições por trecho (`description_edits`, [0005](0005-contextual-ai-edits.md)) resolvem a causa: o modelo mexe só na linha que muda, e reescrever sem ter lido a descrição inteira é recusado. A trava continua valendo para elas.
- O servidor MCP (`mcp/tasks.ts`) escreve por outro caminho e não passa pela trava; ele guarda a versão anterior, como os outros.
- Uma versão guarda o texto, não os arquivos: restaurar traz o texto de volta e mantém os anexos que a tarefa tem agora.
- Implementação: `packages/backend/src/services/agent/core/descriptionHistory.ts` (trava) e `services/taskDescriptionVersionService.ts` (versões, tabela `task_description_versions`); na web, `components/features/tasks/TaskDescriptionVersions`. Testes: `npm run eval:description-history` (e `:live`, com o modelo real) e `npm run eval:task-description-versions`.
