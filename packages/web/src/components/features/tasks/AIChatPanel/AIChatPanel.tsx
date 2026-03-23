import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { X, PaperPlaneRight, NotePencil } from '@phosphor-icons/react';
import { useAuth } from '../../../../contexts/AuthContext';
import { useChatStream, ToolCallData } from '../../../../hooks/useChatStream';
import { Button } from '../../../ui';
import { ChatMessage } from './ChatMessage';
import { SkillChips } from './SkillChips';
import jarviLogo from '../../../../assets/logo/symbol.svg';
import styles from './AIChatPanel.module.css';

export interface AIChatPanelProps {
  mode: 'task' | 'general';
  taskId?: string;
  taskTitle?: string;
  onClose: () => void;
  /** Called once per new successful tool call, with the tool call data */
  onTaskMutated: (toolCalls: ToolCallData[]) => void;
  /** Message to send automatically when the panel first mounts */
  initialMessage?: string;
  /** Called when the user clicks a task card artifact inside the chat */
  onTaskCardClick?: (taskId: string) => void;
}

export function AIChatPanel({
  mode,
  taskId,
  onClose,
  onTaskMutated,
  initialMessage,
  onTaskCardClick,
}: AIChatPanelProps) {
  const { user } = useAuth();
  const { messages, sendMessage, isStreaming, reset } = useChatStream(mode, taskId);
  const [input, setInput] = useState('');
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initialSentRef = useRef(false);
  // Track already-processed tool results to avoid calling onTaskMutated repeatedly
  // as text tokens stream in after a tool call completes.
  const processedToolResultsRef = useRef(new Set<string>());

  const hasMessages = messages.length > 0;

  // Send initialMessage on first mount (e.g. from ControlBar prompt)
  useLayoutEffect(() => {
    if (initialMessage && !initialSentRef.current) {
      initialSentRef.current = true;
      sendMessage(initialMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally runs only on mount

  const scrollToBottom = useCallback(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Fire onTaskMutated exactly once per new successful tool result.
  useEffect(() => {
    const newCalls: ToolCallData[] = [];

    messages.forEach((m) => {
      m.toolCalls?.forEach((tc, idx) => {
        const key = `${m.id}-${idx}`;
        if (tc.result?.success && !processedToolResultsRef.current.has(key)) {
          processedToolResultsRef.current.add(key);
          newCalls.push(tc);
        }
      });
    });

    if (newCalls.length > 0) {
      onTaskMutated(newCalls);
    }
  }, [messages, onTaskMutated]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    sendMessage(text);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, isStreaming, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSkillSelect = (skill: string) => {
    sendMessage(skill);
  };

  const handleNewConversation = () => {
    reset();
    setInput('');
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const firstName = user?.name?.split(' ')[0] || '';

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <img src={jarviLogo} alt="Jarvi" className={styles.headerIcon} />
        <span className={styles.headerTitle}>
          {hasMessages ? 'Conversa' : 'Nova conversa'}
        </span>
        <div className={styles.headerActions}>
          {hasMessages && (
            <Button
              variant="ghost"
              size="small"
              icon={NotePencil}
              iconPosition="icon-only"
              aria-label="Nova conversa"
              onClick={handleNewConversation}
            />
          )}
          <Button
            variant="ghost"
            size="small"
            icon={X}
            iconPosition="icon-only"
            aria-label="Fechar"
            onClick={onClose}
          />
        </div>
      </div>

      {/* Chat Body */}
      <div className={styles.chatBody} ref={chatBodyRef}>
        {!hasMessages ? (
          <div className={styles.emptyState}>
            <img src={jarviLogo} alt="" className={styles.emptyLogo} />
            <h3 className={styles.emptyTitle}>
              Oi{firstName ? `, ${firstName}` : ''}!
              <br />
              Como posso te ajudar?
            </h3>
            <p className={styles.emptySubtitle}>
              Algumas ideias do que posso fazer:
            </p>
            <SkillChips mode={mode} onSelect={handleSkillSelect} />
          </div>
        ) : (
          <div className={styles.messageList}>
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} onTaskCardClick={onTaskCardClick} />
            ))}
            {isStreaming && messages[messages.length - 1]?.content === '' && (
              <div className={styles.typingIndicator}>
                <span />
                <span />
                <span />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className={styles.inputBar}>
        <div className={styles.inputWrapper}>
          <textarea
            ref={textareaRef}
            className={styles.inputField}
            placeholder="Me diga o que você precisa fazer ou saber..."
            value={input}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={isStreaming}
          />
          <button
            className={`${styles.sendButton} ${input.trim() && !isStreaming ? styles.sendButtonActive : ''}`}
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            aria-label="Enviar"
          >
            <PaperPlaneRight size={18} weight="fill" />
          </button>
        </div>
      </div>
    </div>
  );
}
