# 0004 — Recap das tarefas vencidas: uma tarefa por vez, uma vez por dia

**Superfície:** web (Tarefas) + backend · **Status:** em vigor

## Contexto

Tarefas vencidas se acumulam na seção **Vencidas**, que começa fechada, e ninguém volta lá. O Recap é um dialog no estilo do Catch up do Slack: mostra as vencidas uma de cada vez, e a pessoa resolve cada uma com um gesto. A recorrência agrava o acúmulo: o sweep cria a próxima ocorrência de uma série mesmo quando a anterior não foi concluída, então uma tarefa diária ignorada por três meses deixa ~90 linhas vencidas.

## Decisão

1. **Uma tarefa por vez, em tela cheia, com ações explícitas.** A tarefa aparece grande no centro. Arrastar para a direita (ou →) conclui; para a esquerda (ou ←) ignora por enquanto, sem mudar nada. Os botões são Ignorar, Concluir e Reagendar (Hoje, Amanhã ou Escolher data; o calendário troca o conteúdo no lugar, sem segundo overlay, [0001](0001-one-overlay.md)). Não há excluir no Recap. Nada muda sem um gesto da pessoa, e concluir ou reagendar pode ser desfeito pelo toast ou com ⌘Z enquanto o Recap está aberto. Termina numa tela "Tudo revisado!".
2. **Vencida é a regra da seção Vencidas:** não concluída, com data anterior a hoje; o horário não conta.
3. **Uma série recorrente é um card só.** As ocorrências vencidas da mesma série (`recurrence_parent_id`) viram um card com "N vencidas desde …". Concluir marca todas como feitas, numa chamada (`PATCH /api/tasks/completion`, que define o estado em vez de alternar, então uma tarefa já concluída em outro lugar continua concluída). As próximas ocorrências não mudam. Série não tem reagendar nem excluir: ela já tem a próxima data.
4. **Abre sozinho no máximo uma vez por dia, só numa página ociosa.** A decisão é tomada uma vez, quando a página de Tarefas recebe as tarefas: se houver vencidas, se não estiver aberto um chat, uma tarefa, o onboarding ou outro dialog. Se o momento passar, espera a próxima visita, em vez de aparecer no meio de outra coisa. O botão **Recap (N)** no cabeçalho abre a qualquer hora.
5. **É desligável.** Configurações › Tarefas › "Recap de tarefas vencidas" (`users.overdue_recap_enabled`, ligado por padrão como os outros avisos). Desligado, não abre sozinho e o botão some.
6. **A fila é fixa enquanto o Recap está aberto.** A ordem vem do momento em que ele abre (mais recente primeiro), para os cards não pularem quando as tarefas recarregam. Um card resolvido em outro lugar (outra aba, WhatsApp, agente) sai da fila sozinho.

## Alternativas descartadas

- **Um card por ocorrência.** Com séries ignoradas, a fila teria centenas de cards iguais.
- **Concluir só a ocorrência mais recente da série.** As anteriores continuariam vencidas, e a série voltaria ao Recap todo dia.
- **Abrir sempre que houver vencidas.** Seria um aviso empurrado no meio do uso, o que a [0002](0002-backend-owned-confirmations.md) evita.
- **Guardar "já abriu hoje" no servidor.** Hoje fica no navegador (por usuário e dispositivo); abrir uma vez em cada dispositivo foi aceito como custo.

## Consequência

- O Recap só reflete as séries; ele não corrige o sweep, que continua criando ocorrências de séries ignoradas.
- Desfazer uma conclusão não remove a próxima ocorrência que ela criou, como acontece ao desmarcar na lista.
