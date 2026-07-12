import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import type { ClipboardEvent, DragEvent } from 'react';
import { X, PaperPlaneRight, NotePencil, Sparkle, Paperclip, FileText, UploadSimple } from '@phosphor-icons/react';
import { useAuth } from '../../../../contexts/AuthContext';
import { useSubscription } from '../../../../contexts/SubscriptionContext';
import { useChatStream, ToolCallData, ChatAttachment } from '../../../../hooks/useChatStream';
import {
  MAX_CHAT_ATTACHMENTS,
  PendingAttachment,
  filesToPendingAttachments,
  toChatAttachmentPayload,
} from '../../../../utils/chatAttachments';
import { Button } from '../../../ui';
import { AttachmentViewer } from '../../../ui/AttachmentViewer';
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
  /** Attachments to send alongside the initial message (e.g. from ControlBar) */
  initialAttachments?: ChatAttachment[];
  /** Called when the user clicks a task card artifact inside the chat */
  onTaskCardClick?: (taskId: string) => void;
  /** Called when the user clicks a list/filter card artifact inside the chat */
  onListCardClick?: (listId: string) => void;
  /** Called when the user clicks a category card artifact inside the chat */
  onCategoryCardClick?: (categoryName: string) => void;
  /**
   * Called when a message with attachments is sent in task mode, so the parent
   * can persist those files into the task's context (description attachments).
   */
  onAttachToTask?: (attachments: ChatAttachment[]) => void;
  /**
   * Called when a message with attachments is sent in general mode, so the
   * parent can attach those files to a task the AI creates in the same turn.
   */
  onAttachmentsSent?: (attachments: ChatAttachment[]) => void;
}

export function AIChatPanel({
  mode,
  taskId,
  onClose,
  onTaskMutated,
  initialMessage,
  initialAttachments,
  onTaskCardClick,
  onListCardClick,
  onCategoryCardClick,
  onAttachToTask,
  onAttachmentsSent,
}: AIChatPanelProps) {
  const { user } = useAuth();
  const { trialExpired } = useSubscription();
  const { messages, sendMessage, isStreaming, thinkingStatus, reset } = useChatStream(mode, taskId);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [viewingAttachment, setViewingAttachment] = useState<PendingAttachment | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialSentRef = useRef(false);
  // Track already-processed tool results to avoid calling onTaskMutated repeatedly
  // as text tokens stream in after a tool call completes.
  const processedToolResultsRef = useRef(new Set<string>());

  const hasMessages = messages.length > 0;

  // Send initialMessage on first mount (e.g. from ControlBar prompt)
  useLayoutEffect(() => {
    const hasInitialAttachments = (initialAttachments?.length ?? 0) > 0;
    if ((initialMessage || hasInitialAttachments) && !initialSentRef.current) {
      initialSentRef.current = true;
      // The initial message bypasses handleSend, so replicate its attachment
      // persistence here — otherwise files sent with the first message (e.g.
      // from the ControlBar) never reach the task the AI creates this turn.
      if (hasInitialAttachments && initialAttachments) {
        if (mode === 'task') {
          onAttachToTask?.(initialAttachments);
        } else {
          onAttachmentsSent?.(initialAttachments);
        }
      }
      sendMessage(initialMessage ?? '', initialAttachments ?? []);
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

  const addFiles = useCallback(async (files: File[]) => {
    if (!files.length || trialExpired) return;
    const prepared = await filesToPendingAttachments(files);
    if (!prepared.length) return;
    setAttachments((prev) => [...prev, ...prepared].slice(0, MAX_CHAT_ATTACHMENTS));
  }, [trialExpired]);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      void addFiles(Array.from(e.target.files ?? []));
      e.target.value = '';
    },
    [addFiles],
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = Array.from(e.clipboardData.files);
      if (!files.length) return;
      e.preventDefault();
      void addFiles(files);
    },
    [addFiles],
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (trialExpired) return;
    e.preventDefault();
    setIsDragging(true);
  }, [trialExpired]);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    // Ignore leaves that just move onto a child element of the drop zone.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) void addFiles(files);
    },
    [addFiles],
  );

  const handleSend = useCallback(() => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || isStreaming || trialExpired) return;
    const payload: ChatAttachment[] = toChatAttachmentPayload(attachments);
    setInput('');
    setAttachments([]);
    // Persist the files into a task's context so they live on after the
    // message is sent (and the input chips are cleared): in task mode, attach
    // to the current task; in general mode, hand them to the parent so they can
    // be attached to a task the AI creates in this same turn.
    if (payload.length > 0) {
      if (mode === 'task') {
        onAttachToTask?.(payload);
      } else {
        onAttachmentsSent?.(payload);
      }
    }
    sendMessage(text, payload);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, attachments, isStreaming, trialExpired, sendMessage, mode, onAttachToTask, onAttachmentsSent]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSkillSelect = (skill: string) => {
    if (trialExpired) return;
    sendMessage(skill);
  };

  const handleNewConversation = () => {
    reset();
    setInput('');
    setAttachments([]);
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
        <Sparkle weight="fill" size={20} className={styles.headerIcon} />
        <span className={styles.headerTitle}>
          {hasMessages ? 'Conversa' : 'Nova conversa'}
        </span>
        <div className={styles.headerActions}>
          {hasMessages && (
            <Button
              variant="secondary"
              icon={NotePencil}
              iconPosition="icon-only"
              aria-label="Nova conversa"
              onClick={handleNewConversation}
            />
          )}
          <Button
            variant="secondary"
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
            {messages.map((msg, index) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                isStreaming={isStreaming && index === messages.length - 1 && msg.role === 'assistant'}
                thinkingStatus={
                  isStreaming && index === messages.length - 1 && msg.role === 'assistant'
                    ? thinkingStatus
                    : undefined
                }
                onTaskCardClick={onTaskCardClick}
                onListCardClick={onListCardClick}
                onCategoryCardClick={onCategoryCardClick}
              />
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className={styles.inputBar}>
        {attachments.length > 0 && (
          <div className={styles.attachmentBar}>
            {attachments.map((a) => (
              <div key={a.id} className={styles.attachmentChip} title={a.name}>
                <button
                  type="button"
                  className={styles.attachmentChipPreview}
                  onClick={() => setViewingAttachment(a)}
                  aria-label={`Visualizar ${a.name}`}
                >
                  <FileText size={14} weight="fill" className={styles.attachmentChipIcon} />
                  <span className={styles.attachmentChipName}>{a.name}</span>
                </button>
                <button
                  type="button"
                  className={styles.attachmentRemove}
                  onClick={() => handleRemoveAttachment(a.id)}
                  aria-label={`Remover ${a.name}`}
                >
                  <X size={12} weight="bold" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div
          className={`${styles.inputWrapper} ${isDragging ? styles.inputWrapperDragging : ''}`}
          data-theme="dark"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className={styles.dropOverlay}>
              <UploadSimple size={20} weight="bold" />
              <span>Solte para anexar</span>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className={styles.hiddenFileInput}
            onChange={handleFileInputChange}
          />
          <textarea
            ref={textareaRef}
            className={styles.inputField}
            placeholder="Como posso te ajudar?"
            value={input}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            rows={1}
            disabled={isStreaming || trialExpired}
          />
          <div className={styles.inputActions}>
            <button
              type="button"
              className={styles.attachButton}
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming || trialExpired || attachments.length >= MAX_CHAT_ATTACHMENTS}
              aria-label="Anexar arquivo"
            >
              <Paperclip size={20} />
            </button>
            <button
              className={styles.sendButton}
              onClick={handleSend}
              disabled={(!input.trim() && attachments.length === 0) || isStreaming || trialExpired}
              aria-label="Enviar"
            >
              <PaperPlaneRight size={20} weight="fill" />
            </button>
          </div>
        </div>
      </div>

      {viewingAttachment && (
        <AttachmentViewer
          attachment={{
            id: viewingAttachment.id,
            name: viewingAttachment.name,
            mimeType: viewingAttachment.mimeType,
            previewUrl: `data:${viewingAttachment.mimeType};base64,${viewingAttachment.data}`,
          }}
          onClose={() => setViewingAttachment(null)}
          onRemove={() => handleRemoveAttachment(viewingAttachment.id)}
        />
      )}
    </div>
  );
}
