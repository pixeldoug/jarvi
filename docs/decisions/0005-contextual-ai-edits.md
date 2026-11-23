# 0005 — A IA edita o texto no lugar certo, por trecho

**Superfície:** agente (web + WhatsApp) + web (Notas) · **Status:** em vigor

## Contexto

O chat escreve em dois textos da pessoa: a nota aberta ao lado da conversa e a descrição das tarefas. Até aqui havia dois comportamentos, e os dois erravam o lugar:

- **Nota:** o conteúdo novo sempre ia para o fim. Uma pendência pedida numa nota com a seção "Próximos passos" no meio aparecia depois de tudo.
- **Descrição de tarefa:** a IA reescrevia o documento inteiro a cada mudança. No chat geral ela só vê os primeiros 220 caracteres da descrição, então reescrever significava perder o que não estava à vista. Mesmo vendo tudo, reescrever troca redação, ordem e formatação de trechos que não tinham relação com o pedido.

## Decisão

1. **A IA manda edições por trecho, não o texto inteiro.** Cada edição diz onde (`anchor`: um trecho que já existe, o título de uma seção ou uma linha) e o que entra (`content`, em Markdown). As ações são: entrar no fim de uma seção, antes ou depois de uma linha, trocar uma linha ou só um pedaço dela, refazer uma seção, tirar uma linha, ir para o fim do texto e trocar o texto inteiro. As duas ferramentas usam o mesmo formato: `update_note.edits` e `update_task.description_edits`.
2. **O fim do texto é exceção.** A regra passada ao modelo é ler o que existe e escolher o lugar: o que pertence a uma seção ou lista entra nela, o que atualiza algo já escrito troca esse trecho em vez de criar uma segunda linha, e só um assunto sem relação com o resto vai para o fim.
3. **Só muda o que a edição toca.** As edições são aplicadas direto no documento salvo (os nós do editor), não num Markdown regenerado. Formatação, itens marcados, itens aninhados, chips de arquivo e anexos do que não foi tocado ficam idênticos. O que entra numa lista toma a forma da lista: um item solto adicionado a um checklist vira caixa de seleção.
4. **Trecho que não existe não vira escrita no lugar errado.** Se um `anchor` não é encontrado, nada é salvo e o modelo recebe o texto atual para refazer a chamada. O mesmo vale quando o `anchor` é só um pedaço de uma linha e esse pedaço não pode ser trocado sozinho (por exemplo, atravessa uma quebra de linha): a linha inteira nunca é trocada para "fazer caber". Para a pessoa isso é silencioso: ela só vê a confirmação quando a edição entra. Itens de lista aninhados sob outro item também servem de `anchor`, e a edição mexe só neles.
5. **Sem ler, não sobrescreve.** Trocar a descrição inteira, trocar uma seção inteira ou limpar a descrição só é aceito se o modelo viu a descrição toda: no chat da própria tarefa, quando ela cabe na linha da lista, ou depois de um resultado de ferramenta que a mostrou inteira naquele turno. Uma descrição mostrada cortada (acima de 12 mil caracteres) não conta como lida; nela só entram edições por linha. O mesmo vale para a nota: acima de 12 mil caracteres o chat a vê com o meio cortado, e então não troca uma seção inteira nem o texto inteiro. Fora disso a chamada é segurada da mesma forma que no item 4.
6. **O modelo vê a estrutura.** No chat da tarefa a descrição vai em Markdown (antes ia como texto corrido, sem títulos nem listas). Na lista de tarefas, cada linha mostra também os títulos das seções da descrição, que servem de `anchor`.
7. **A nota aberta aplica a mesma edição.** O servidor salva primeiro. O editor da nota tem rascunho próprio e nunca é sobrescrito pelo servidor, então a tela reaplica as mesmas edições no rascunho e salva de novo, o que preserva o que a pessoa digitou enquanto o chat respondia. Uma edição que troca ou tira um trecho só é aplicada se esse trecho continua igual ao que a IA leu no começo do turno: se a pessoa mexeu nele depois, o servidor não salva e devolve o texto atual para a IA refazer, e a tela pula a edição e avisa. Quando o servidor devolve o texto atual, esse passa a ser o texto lido pela IA, no servidor e na tela (o servidor manda à tela a impressão digital do texto mostrado), para a nova tentativa entrar nos dois lados. Edições que só acrescentam passam sempre. Por isso o aplicador existe duas vezes, com o mesmo código: `packages/backend/src/utils/docEdits.ts` e `packages/web/src/utils/docEdits.ts`.

8. **No máximo 20 edições por chamada.** Uma lista maior é recusada inteira, com o pedido para dividir em mais chamadas; nunca é cortada e dada como feita.
9. **A edição por trecho também respeita o histórico da tarefa.** Uma linha que uma edição troca ou tira de uma descrição passa pela mesma regra da [0006](0006-description-keeps-history.md): sem o pedido da pessoa, ela volta em `## Histórico`. `## Próximos passos` continua livre.

## Alternativas descartadas

- **Só mudar o prompt** ("coloque no lugar certo") e continuar reescrevendo o texto inteiro. Não resolve a perda do que o modelo não vê no chat geral, e não garante que o resto do texto fique igual.
- **Uma segunda chamada de IA só para posicionar** (o agente diz o que entra, um modelo "editor" decide onde). Dobra custo e tempo de cada edição, e o agente principal já acerta o lugar quando vê a estrutura.
- **Endereçar por posição** (bloco 3, item 2) em vez de por texto. Exigiria numerar os blocos em todo lugar em que o texto aparece para o modelo, e a posição muda entre a leitura e a escrita; o texto da linha não.
- **Cair para o fim do texto quando o trecho não é encontrado.** Volta ao comportamento antigo justamente nos casos difíceis, sem ninguém perceber.

## Onde ver no código

- Aplicador das edições: `packages/backend/src/utils/docEdits.ts` (espelhado em `packages/web/src/utils/docEdits.ts`).
- Formato das edições e regras passadas ao modelo: `packages/backend/src/services/agent/core/contextualEdits.ts`.
- Ferramentas: `update_note` e `update_task` em `packages/backend/src/services/agent/core/tools.ts`.
- Testes: `npm run eval:contextual-edits` em `packages/backend`.
