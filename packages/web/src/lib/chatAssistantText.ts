const RESTART_LEAD =
  /^(entendi|claro|beleza|certo|ok|pronto)[,.]?\s+/i;
const CONFIRMATION =
  /já deixei|organizei pra você|organizei para você|pra não cair no esquecimento|para não cair no esquecimento|tarefa pronta/i;

function splitBlocks(text: string): string[] {
  return text
    .replace(/([.!?])(?=(?:Entendi|Claro|Beleza|Certo|Ok)[,.]?\s)/g, '$1\n\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function isRestartedConfirmation(block: string): boolean {
  return RESTART_LEAD.test(block.trim()) && CONFIRMATION.test(block);
}

/**
 * Drops a second confirmation glued onto the first ("...dizer.Entendi, doug.
 * Já deixei isso organizado..."). Keeps the human opener + the first ack.
 */
export function stripRestartedAssistantReply(text: string): string {
  if (!text.trim()) return text;

  const blocks = splitBlocks(text);
  if (blocks.length === 0) return '';

  const kept: string[] = [];
  let sawConfirmation = false;

  for (const block of blocks) {
    const confirmation = CONFIRMATION.test(block);
    if (sawConfirmation && (isRestartedConfirmation(block) || confirmation)) {
      continue;
    }
    kept.push(block);
    if (confirmation) sawConfirmation = true;
  }

  return kept.join('\n\n');
}

export function coalesceAssistantBodies(
  content: string,
  contentAfter: string,
  options: { mergeIntoOne?: boolean } = {},
): {
  content: string;
  contentAfter: string;
} {
  const head = stripRestartedAssistantReply(content);
  const tail = stripRestartedAssistantReply(contentAfter);

  if (!tail) return { content: head, contentAfter: '' };
  if (!head) {
    return options.mergeIntoOne
      ? { content: tail, contentAfter: '' }
      : { content: '', contentAfter: tail };
  }

  if (isRestartedConfirmation(tail) && CONFIRMATION.test(head)) {
    return { content: head, contentAfter: '' };
  }

  if (options.mergeIntoOne) {
    return {
      content: stripRestartedAssistantReply(`${head}\n\n${tail}`),
      contentAfter: '',
    };
  }

  return { content: head, contentAfter: tail };
}
