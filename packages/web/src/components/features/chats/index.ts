/**
 * Chats feature — the conversation history with the Jarvi agent (the
 * sidebar's Chats section and deleting a conversation). The chat itself is
 * AIChatPanel (features/tasks); the page is pages/Chats.
 */

export {
  ChatHistoryPanel,
  UNTITLED_CHAT,
  useChatsSectionMode,
  type ChatHistoryPanelProps,
  type ChatsSectionMode,
} from './ChatHistoryPanel';
export { DeleteChatDialog, type DeleteChatDialogProps } from './DeleteChatDialog';
