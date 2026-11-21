import type { ChatMessageData } from './types';

/**
 * Hand-off for the first conversation after onboarding: the onboarding screen
 * leaves the follow-up here and the signed-in stack opens the chat with it.
 * The chat provider is not mounted until onboarding finishes, hence a module slot.
 */
let pending: ChatMessageData[] | null = null;

export function setPendingChatSeed(messages: ChatMessageData[] | null): void {
  pending = messages;
}

export function takePendingChatSeed(): ChatMessageData[] | null {
  const messages = pending;
  pending = null;
  return messages;
}
