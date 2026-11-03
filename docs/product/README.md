# Produto

**Quem lê:** time e AI quando a pergunta é “o que estamos construindo?”, não “qual componente usar?”.

**O que não entra aqui:** spec de Dialog, tokens, bans de CSS. Isso é [compliance](../../packages/web/compliance.md) da superfície.

## O que é a Jarvi

A Jarvi é um app de **tarefas e produtividade**: capturar, organizar e acompanhar o que precisa ser feito, com conta, integrações e memória no produto — não só uma lista local.

### Notas

No web, **Notas** (sidebar, abaixo de Recorrentes) é onde a captura começa antes de virar tarefa. Uma nota tem três abas:

- **Notas**: texto livre, com comandos `/`.
- **Resumo**: gerado por IA a partir das notas e da transcrição. É editável e pode ser gerado de novo.
- **Transcrição**: o áudio gravado, transcrito ao vivo enquanto a gravação continua. Também dá para enviar um arquivo de áudio já gravado (MP3, M4A, WAV, OGG…, até 2 h).

Dá para escrever e gravar ao mesmo tempo. Ao parar a gravação, o resumo é gerado automaticamente se a nota ainda não tiver um. O prompt bar é o mesmo da lista de tarefas, mas o grupo de modos (IA / tarefa) dá lugar ao controle de gravar. Perguntar algo ali abre o chat com a nota como contexto, e daí saem tarefas. O áudio não é guardado; o porquê está em [0003](../decisions/0003-notes-transcript-not-audio.md).

Os **próximos passos** do resumo (os itens com checkbox) viram tarefas pelo botão **Criar tarefas** do Resumo. A pessoa escolhe quais itens converter, e cada um vira uma tarefa na Lista de tarefas, na categoria da nota quando ela existe. Um dia concreto citado no texto ("até quinta-feira", "amanhã", "dia 24") vira o prazo e sai do título. Períodos vagos ("semana que vem") não viram prazo, e sem prazo a tarefa vai para a Caixa de entrada. A ligação vale nos dois sentidos: no resumo, o item convertido mostra a marca "Tarefa", que abre a tarefa, e marcar ou desmarcar o item conclui ou reabre a tarefa. Na lista, a tarefa mostra o chip "Nota", que abre o resumo. Um item convertido não é oferecido de novo, nem depois de "Gerar novamente". Apagar a nota mantém as tarefas e só desfaz a ligação.

Cada nota tem uma **data** (por padrão, o dia em que foi criada; dá para mudar, por exemplo para o dia da reunião) e pode ter uma **categoria**, a mesma lista de categorias das tarefas. A lista de notas é agrupada pela data da nota. Só o dono atribui a categoria.

Em qualquer editor de texto do app (notas, resumo, descrição de tarefa), selecionar um trecho mostra **✨ Melhorar** na barra de formatação: Corrigir gramática, Melhorar escrita, Encurtar e Expandir. A IA reescreve só o trecho selecionado, mantendo a formatação (listas, negrito, links), e um ⌘Z desfaz. Seleções com imagem, anexo ou bloco de código ficam de fora.

## Superfícies

| Superfície | Package | Papel |
|------------|---------|--------|
| App web | `packages/web` | Produto logado (tarefas, conta, settings) |
| Site | `packages/marketing` | Marketing, conversão, conteúdo público |
| Mobile | `packages/mobile` | App iOS/Android (Expo) |

Backend (`packages/backend`) e shared (`packages/shared`) não são superfícies de UI; não têm `compliance.md` de interface.

## Quando for construir UI

Depois de saber *o quê*, abra o contrato da superfície — não este arquivo:

- Web: [packages/web/compliance.md](../../packages/web/compliance.md)
- Marketing: [packages/marketing/compliance.md](../../packages/marketing/compliance.md)
- Mobile: [packages/mobile/compliance.md](../../packages/mobile/compliance.md)
