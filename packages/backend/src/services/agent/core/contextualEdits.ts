/**
 * Contextual edits — what the model is told, and offered, to change a note or
 * a task description in the right place instead of appending to its end.
 *
 * One schema and one set of rules for both (`update_note.edits`,
 * `update_task.description_edits`); the edits themselves are applied by
 * utils/docEdits.ts.
 */

import { DOC_EDIT_ACTIONS, DOC_EDITS_MAX, type DocEditFailure } from '../../../utils/docEdits';

/**
 * How much of a description the model is shown: in the focused task's prompt,
 * and in the message that asks it to redo an edit. A longer description is
 * shown cut, and then does not count as read (see hasSeenDescription in
 * tools.ts).
 */
export const DESCRIPTION_SHOWN_MAX_CHARS = 12_000;

/** JSON schema of an `edits` array (a tool property). */
export function docEditsToolProperty(subject: 'nota' | 'descrição'): Record<string, unknown> {
  return {
    type: 'array',
    maxItems: DOC_EDITS_MAX,
    description: `Edições na ${subject}, aplicadas em ordem (no máximo ${DOC_EDITS_MAX} por chamada; se precisar de mais, faça outra chamada). Cada uma diz ONDE (\`anchor\`: um trecho que já existe) e O QUE entra (\`content\`). O resto do texto fica exatamente como está.`,
    items: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [...DOC_EDIT_ACTIONS],
          description:
            'append_to_section: entra no fim da seção cujo título é `anchor` (se a seção é uma lista, entra como mais um item). insert_after / insert_before: logo depois / antes da linha `anchor`. replace: se `anchor` é a linha inteira, ela vira `content`; se é só um trecho da linha (uma palavra, um valor, uma data), só esse trecho é trocado e o resto da linha fica. replace_section: o corpo da seção `anchor` vira `content` (o título fica; sem `content`, a seção inteira sai). delete: a linha `anchor` sai. append: fim do texto — só quando nada do que já existe tem relação com o que entra. replace_all: troca o texto inteiro — só quando o usuário pedir para reescrever ou reorganizar tudo.',
        },
        anchor: {
          type: 'string',
          description:
            'Trecho que JÁ EXISTE no texto: o título da seção (append_to_section, replace_section) ou a linha exata — um parágrafo ou um item de lista (insert_after, insert_before, replace, delete). Copie como aparece, sem os marcadores (#, -, [ ]). Não use em append nem em replace_all.',
        },
        content: {
          type: 'string',
          description:
            'Markdown do que entra: SÓ o trecho novo, no formato da vizinhança (`- [ ] ` em checklist, `- ` em lista, `## ` para um título novo). Nunca repita o que já está no texto. Sem tabelas, blocos de código nem listas aninhadas. Omita em delete.',
        },
      },
      required: ['action'],
    },
  };
}

/** Prompt rules for choosing where an edit goes. `field` is how the edits are sent. */
export function contextualEditRules(subject: 'nota' | 'descrição', field: string): string {
  return [
    `⛔ EDIÇÃO NO LUGAR CERTO (${field}): antes de mudar a ${subject}, leia o que já está escrito e decida ONDE a mudança pertence. O fim do texto NÃO é o padrão.`,
    '- Informação que pertence a uma seção ou lista que já existe (uma pendência → "Próximos passos"; um critério de aceite → junto dos outros critérios; um item → na lista dele): `append_to_section` com o título da seção, ou `insert_after` / `insert_before` com a linha vizinha — mesmo que a seção esteja no meio do texto.',
    '- Informação que corrige, completa ou atualiza algo que já está escrito: `replace` nessa linha — a linha inteira em `anchor` e a nova em `content`, ou só o trecho que muda nos dois ("março" → "abril"). PROIBIDO criar uma segunda linha dizendo quase a mesma coisa.',
    '- Algo que deixou de valer: `delete` na linha.',
    '- `append` (fim do texto) SOMENTE quando nenhum trecho existente tem relação com o que entra. Assunto novo ganha o próprio título (`## `).',
    '- MUDANÇA MÍNIMA: `content` leva só o trecho novo, no mesmo formato da vizinhança. Não repita, não reordene, não reformate e não reescreva o que não tem relação com o pedido — uma linha que continua valendo NUNCA entra num `replace_section` só para ser copiada de volta. Não acrescente o que o usuário não pediu. `replace_section` é para quando a seção inteira mudou; `replace_all`, só quando o usuário pedir para reescrever ou reorganizar tudo.',
    '- `anchor` é sempre uma linha que JÁ EXISTE, copiada como aparece (sem #, -, [ ]). Mais de uma mudança no mesmo pedido: todas no mesmo array, em ordem.',
  ].join('\n');
}

/** What the model reads when a call carries more edits than one call may: nothing was written. */
export function tooManyEditsMessage(count: number): string {
  return `São ${count} edições numa chamada só e o máximo é ${DOC_EDITS_MAX}: nada foi alterado. Mande de novo em mais de uma chamada, com até ${DOC_EDITS_MAX} edições em cada. Não diga ao usuário que deu erro: só refaça.`;
}

/**
 * What the model reads when it tried to overwrite text it never saw whole (a
 * task line shows only the start of a description): nothing was written.
 */
export function unseenTextMessage(currentMarkdown: string, truncated = false): string {
  return [
    'Você só viu o começo desta descrição, e essa chamada apagaria trechos que você não leu: nada foi alterado.',
    `Texto atual da descrição${truncated ? ' (só o começo; o texto continua)' : ''}:\n<texto>\n${currentMarkdown.trim()}\n</texto>`,
    truncated
      ? 'A descrição é longa demais para ser mostrada inteira, então ela não pode ser reescrita nem ter uma seção inteira trocada por aqui. Chame de novo com description_edits mexendo só nas linhas que mudam: `replace` / `delete` na linha, `append_to_section` para o que entra. Não diga ao usuário que deu erro: só refaça.'
      : 'Chame de novo com description_edits mexendo só no que muda: `replace` / `delete` na linha, `append_to_section` para o que entra. Não diga ao usuário que deu erro: só refaça.',
  ].join('\n');
}

/**
 * What the model reads when an edit could not be placed: nothing was written,
 * try again. `truncated`: the text shown is only its start.
 */
export function anchorNotFoundMessage(
  subject: 'nota' | 'descrição',
  failures: Pick<DocEditFailure, 'anchor' | 'reason'>[],
  currentMarkdown: string,
  truncated = false,
): string {
  const quote = (list: typeof failures): string =>
    list.filter((failure) => failure.anchor).map((failure) => `"${failure.anchor}"`).join(', ');
  const parts = failures.filter((failure) => failure.reason === 'part_not_replaceable');
  const changed = failures.filter((failure) => failure.reason === 'changed_meanwhile');
  const missing = failures.filter((failure) => !parts.includes(failure) && !changed.includes(failure));
  return [
    missing.length > 0 ? `Não achei ${quote(missing) || 'o trecho'} na ${subject}: nada foi alterado.` : null,
    changed.length > 0
      ? `O usuário mexeu em ${quote(changed) || 'esse trecho'} enquanto você respondia, e a sua edição apagaria o que ele escreveu: nada foi alterado. Leia o texto atual abaixo e refaça a edição em cima do que está lá agora, mantendo o que ele acrescentou.`
      : null,
    parts.length > 0
      ? `Não dá para trocar só o trecho ${quote(parts)} dentro da linha: nada foi alterado. Mande a linha inteira em \`anchor\` e a linha nova completa em \`content\`.`
      : null,
    currentMarkdown.trim()
      ? `Texto atual da ${subject}${truncated ? ' (só o começo; o texto continua)' : ''}:\n<texto>\n${currentMarkdown.trim()}\n</texto>`
      : `A ${subject} está vazia.`,
    'Chame de novo com um `anchor` que exista nesse texto (copie a linha), ou com `append` se nada ali tiver relação. Não diga ao usuário que deu erro: só refaça.',
  ]
    .filter(Boolean)
    .join('\n');
}
