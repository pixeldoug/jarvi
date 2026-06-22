import { Request, Response } from 'express';
import { streamChat, ChatMessage } from '../services/agent';
import {
  buildAttachmentContext,
  IncomingChatAttachment,
  MAX_ATTACHMENTS,
} from '../services/chatAttachmentService';

export const handleChat = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const userName = req.user?.name || '';

  if (!userId) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  const { messages, mode, taskId, attachments } = req.body as {
    messages?: ChatMessage[];
    mode?: 'task' | 'general';
    taskId?: string;
    attachments?: IncomingChatAttachment[];
  };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages is required and must be a non-empty array' });
    return;
  }

  if (mode !== 'task' && mode !== 'general') {
    res.status(400).json({ error: 'mode must be "task" or "general"' });
    return;
  }

  if (mode === 'task' && !taskId) {
    res.status(400).json({ error: 'taskId is required when mode is "task"' });
    return;
  }

  if (attachments !== undefined && !Array.isArray(attachments)) {
    res.status(400).json({ error: 'attachments must be an array when provided' });
    return;
  }

  if (Array.isArray(attachments) && attachments.length > MAX_ATTACHMENTS) {
    res.status(400).json({ error: `attachments must contain at most ${MAX_ATTACHMENTS} files` });
    return;
  }

  // Turn any uploaded files into text and fold them into the latest user turn.
  // Done before SSE headers are flushed so failures surface as a JSON error.
  let finalMessages: ChatMessage[] = messages;
  if (Array.isArray(attachments) && attachments.length > 0) {
    try {
      const attachmentContext = await buildAttachmentContext(attachments);
      if (attachmentContext) {
        finalMessages = [...messages];
        for (let i = finalMessages.length - 1; i >= 0; i--) {
          if (finalMessages[i].role === 'user') {
            finalMessages[i] = {
              ...finalMessages[i],
              content: [finalMessages[i].content, attachmentContext]
                .filter(Boolean)
                .join('\n\n'),
            };
            break;
          }
        }
      }
    } catch (err) {
      console.error('Failed to process chat attachments:', err);
      res.status(500).json({ error: 'Failed to process attachments' });
      return;
    }
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendSSE = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await streamChat(userId, userName, finalMessages, mode, taskId, (event) => {
      sendSSE(event);
    });
  } catch (err: any) {
    console.error('AI chat controller error:', err);
    sendSSE({ type: 'error', message: err?.message || 'Internal server error' });
    sendSSE({ type: 'done' });
  }

  res.end();
};
