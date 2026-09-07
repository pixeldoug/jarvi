# 0002 — Confirmações são do backend, não do modelo

**Superfície:** agente (web + WhatsApp) · **Status:** em rollout atrás de flag (`AGENT_RELIABLE_EXECUTION`)

## Contexto

Até aqui o modelo executava a ação (tool) **e** escrevia a frase que dizia ao usuário o que aconteceu. Isso produzia três bugs recorrentes que nenhum ajuste de prompt eliminou:

- **Confirmação falsa** — "Salvo!", "atualizei", "concluída" sem a tool ter rodado, ou depois de ela falhar.
- **Confirmação inventada** — a data/hora escrita no chat não era a que foi persistida (ex.: "semana que vem" virava uma segunda-feira qualquer).
- **Lote sem distinção** — "concluí as duas" quando uma das tarefas não existia.

O guardrail antigo tentava corrigir a **frase** repetindo o turno com `tool_choice=required` — isto é, forçava uma **nova escrita** para consertar um texto. Era um risco de escrita indevida, não uma correção.

## Decisão

1. **O backend escreve toda confirmação** (criar / editar / concluir / excluir; tarefas, listas, categorias) a partir do registro de operações do turno (`AgentRunResult.operations`), ecoando **o que foi persistido** — nunca os argumentos do modelo. Sucesso e falha são frases separadas, sempre; falhas vêm por último e são explícitas. **Exceção deliberada no web:** uma criação bem-sucedida não gera texto — o cartão da tarefa (evento `tool_result`) já é a confirmação verificada, e o modelo fica com a parte humana (empatia + uma pergunta via `offer_choices`), alinhado à regra "humano primeiro" do prompt web. Edições, conclusões, exclusões, duplicatas e falhas continuam confirmadas em texto pelo backend nos dois canais.
2. **O texto do modelo passa por um gate de frases**: frases que afirmam uma escrita ("criei", "atualizei", "concluída", "Feito!", linha solta de data) são descartadas; perguntas, conselhos e negações ("ainda não alterei") ficam. Se o modelo só afirmou coisas que não aconteceram, o usuário recebe "Ainda não alterei nada. Quer que eu faça isso agora?" — e **nenhum retry com tool forçada**.
3. **Argumentos são validados no servidor** contra o schema da tool (datas `YYYY-MM-DD`, horas `HH:MM`, enums, obrigatórios). Inválido → falha estruturada, nada é escrito. Em `update_task`: **omitir = manter**, `null` = limpar, `""` = ignorado (mantém).
4. **Período sem dia nunca vira prazo.** "semana que vem" / "próxima semana" / "essa semana" / "esse mês" / "até o fim do mês" / "nos próximos dias" retém o `due_date` (criar → sem prazo; editar → prazo anterior fica) e o **backend** pergunta o dia ("Qual dia da semana que vem?", "Qual dia dessa semana?"), e o modelo é instruído a não repetir a pergunta. Uma expressão única e inequívoca ("sexta", "amanhã", "dia 24") corrige um prazo do modelo incompatível com ela. Vale igual no chat geral e no chat da tarefa aberta.
5. **No stream (web)**, a confirmação é emitida logo depois do resultado da tool, antes de qualquer texto de continuação do modelo. Preâmbulo sem afirmação ("vou criar isso pra você") continua fluindo — segurar todo o texto até o fim de cada iteração mataria o streaming das respostas comuns.

## Alternativas descartadas

- **Só prompt** ("nunca confirme sem sucesso"): reduz, não elimina; o bug volta a cada mudança de modelo.
- **Reter 100% do texto até o fim do turno**: elimina o preâmbulo, mas perde o streaming em briefings e conselhos, que são a maior parte dos turnos.
- **Retry com `tool_choice=required`**: corrige texto forçando escrita; risco de escrita duplicada/indevida. Mantido apenas no caminho legado (flag off).

## Consequências

- O que o usuário lê sobre uma ação é **verdadeiro por construção**: vem do banco, não do modelo.
- O modelo fica responsável só pelo que o sistema não faz (pergunta curta, conselho). Prompts de formato de confirmação saem do caminho com a flag ligada.
- Telemetria por turno (`ai_turn_completed`): `reliable_execution`, `claims_stripped`, `invalid_tool_calls`, `date_corrections`, `pending_questions`, `write_operations`, `failed_write_operations`, `time_to_first_text_ms` — comparáveis entre flag on/off.
- Rollout: `AGENT_RELIABLE_EXECUTION=off|internal|on` + `AGENT_INTERNAL_USER_EMAILS`. Com a flag desligada valem os mesmos prompts, schemas, retry e texto cru do modelo de antes. Duas correções valem nos dois modos porque só tornam o resultado da tool verdadeiro: `complete_task`/`delete_task` em tarefa inexistente agora falham com `not_found` (antes "sucediam" sem afetar linha nenhuma), e data/hora são normalizadas para `YYYY-MM-DD`/`HH:MM` antes de gravar.
- Verificação: `npm run eval:deterministic` (modelo roteirizado, sem rede) cobre validação, confirmações, lote parcial, datas e stream; `EVAL_RELIABLE_EXECUTION=1 npm run eval` roda a suíte inteira com a flag ligada para comparar com a base.
