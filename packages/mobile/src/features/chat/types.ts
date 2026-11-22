/** Chat message model. Same shape as packages/web/src/hooks/useChatStream.ts. */

export type ChatChoiceField = 'due_date' | 'time' | 'reminders';

export interface ToolCallData {
  toolName: string;
  toolArgs: Record<string, unknown>;
  result?: {
    success: boolean;
    data?: Record<string, unknown>;
  };
}

export interface ChatJourneyNudge {
  text: string;
  remaining: number;
  resumeLabel: string;
}

export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  contentAfter?: string;
  toolCalls?: ToolCallData[];
  /** In-progress reasoning for the current agent iteration. */
  reasoning?: string;
  /** Quick replies the user can tap. */
  choicePrompts?: string[];
  choicePromptTitle?: string;
  /** Task the backend question is about. */
  choiceTaskId?: string;
  choiceTaskTitle?: string;
  /** Task field the backend question is about; echoed back as `pendingQuestion`. */
  choiceField?: ChatChoiceField;
  journeyNudge?: ChatJourneyNudge;
}

/** Echo of the system question being answered (lets the backend skip the model). */
export interface PendingQuestionRef {
  taskId?: string;
  field: ChatChoiceField | 'journey';
}
