import { Request, Response } from 'express';
import * as chatHistoryService from '../services/chatHistoryService';
import { CHAT_ID_MAX_LENGTH } from '../services/chatHistoryService';

// ---------------------------------------------------------------------------
// Chats — the user's conversation history. JSON contract in
// services/chatHistoryService.ts (mirrored by the web's lib/chatsApi.ts).
// Conversations are recorded by POST /api/ai/chat, not created here.
// ---------------------------------------------------------------------------

/** The `:id` param, or null when it can't be a conversation id. */
function chatIdParam(req: Request): string | null {
  const { id } = req.params;
  return typeof id === 'string' && id.length > 0 && id.length <= CHAT_ID_MAX_LENGTH ? id : null;
}

export const getChats = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    res.json(await chatHistoryService.listConversations(userId));
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getChat = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    const id = chatIdParam(req);
    const conversation = id ? await chatHistoryService.getConversation(id, userId) : null;
    if (!conversation) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json(conversation);
  } catch (error) {
    console.error('Error fetching chat:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteChat = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    const id = chatIdParam(req);
    if (!id || !(await chatHistoryService.deleteConversation(id, userId))) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ id });
  } catch (error) {
    console.error('Error deleting chat:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
