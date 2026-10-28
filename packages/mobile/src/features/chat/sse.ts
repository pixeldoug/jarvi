/**
 * Parser for POST /api/ai/chat. The backend streams `data: {json}` lines
 * (SSE framing over a plain fetch body); chunks can split a line anywhere.
 */

export type ChatStreamEventType =
  | 'text'
  | 'reasoning'
  | 'status'
  | 'tool_call'
  | 'tool_result'
  | 'separator'
  | 'choices'
  | 'journey_nudge'
  | 'done'
  | 'error';

export interface ChatStreamEvent {
  type: ChatStreamEventType;
  content?: string;
  message?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  success?: boolean;
  data?: Record<string, unknown>;
  question?: string;
  choices?: string[];
  taskId?: string;
  taskTitle?: string;
  field?: string;
  text?: string;
  remaining?: number;
  resumeLabel?: string;
}

export function createStreamParser(onEvent: (event: ChatStreamEvent) => void) {
  let buffer = '';

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data: ')) return;
    try {
      const event = JSON.parse(trimmed.slice(6)) as ChatStreamEvent;
      if (event && typeof event.type === 'string') onEvent(event);
    } catch {
      // Ignore keep-alives and malformed lines.
    }
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach(handleLine);
    },
    /** Flushes a final line that arrived without a trailing newline. */
    end() {
      if (buffer) handleLine(buffer);
      buffer = '';
    },
  };
}
