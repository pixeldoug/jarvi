import { createContext, use, type ReactNode } from 'react';

import type { ChatMessageData } from './types';
import { useChatSession, type ChatSession } from './use-chat-session';

const ChatContext = createContext<ChatSession | null>(null);

const GENERAL = { mode: 'general' } as const;

/** Holds the Jarvi tab's conversation for the session (it survives tab switches). */
export function ChatProvider({
  children,
  initialMessages = [],
}: {
  children: ReactNode;
  /** E.g. the onboarding follow-up the first time the app opens. */
  initialMessages?: ChatMessageData[];
}) {
  const session = useChatSession(GENERAL, initialMessages);
  return <ChatContext value={session}>{children}</ChatContext>;
}

export function useChat(): ChatSession {
  const context = use(ChatContext);
  if (!context) throw new Error('useChat must be used within ChatProvider');
  return context;
}
