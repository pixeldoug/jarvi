import { Request, Response } from 'express';
import { streamChat, ChatMessage } from '../services/agent';

export const handleChat = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const userName = req.user?.name || '';

  if (!userId) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  const { messages, mode, taskId } = req.body as {
    messages?: ChatMessage[];
    mode?: 'task' | 'general';
    taskId?: string;
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

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendSSE = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await streamChat(userId, userName, messages, mode, taskId, (event) => {
      sendSSE(event);
    });
  } catch (err: any) {
    console.error('AI chat controller error:', err);
    sendSSE({ type: 'error', message: err?.message || 'Internal server error' });
    sendSSE({ type: 'done' });
  }

  res.end();
};
