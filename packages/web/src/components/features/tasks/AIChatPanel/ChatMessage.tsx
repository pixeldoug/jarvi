import { useState, type ReactNode } from 'react';
import { FileText } from '@phosphor-icons/react';
import type { ChatMessageData, ChatAttachmentMeta } from '../../../../hooks/useChatStream';
import { TaskCardMessage } from './TaskCardMessage';
import { ListCardMessage } from './ListCardMessage';
import { CategoryCardMessage } from './CategoryCardMessage';
import { ThinkingBlock } from './ThinkingBlock';
import { AttachmentViewer } from '../../../ui/AttachmentViewer';
import styles from './AIChatPanel.module.css';

// Renders **bold**, `code`, and "quoted names" within a line of text.
// "quoted" segments are rendered as code pills without the surrounding quotes.
function renderInline(text: string): ReactNode[] {
  const segments = text.split(/(\*\*.*?\*\*|`[^`]+`|"[^"]+")/g);
  return segments.map((seg, i) => {
    if (seg.startsWith('**') && seg.endsWith('**')) {
      return <strong key={i}>{seg.slice(2, -2)}</strong>;
    }
    if (seg.startsWith('`') && seg.endsWith('`')) {
      return <code key={i} className={styles.codeInline}>{seg.slice(1, -1)}</code>;
    }
    if (seg.startsWith('"') && seg.endsWith('"')) {
      return <code key={i} className={styles.codeInline}>{seg.slice(1, -1)}</code>;
    }
    return seg;
  });
}

// Converts a plain text AI response into readable nodes:
// - blank lines → visual spacer
// - lines starting with •, -, or * → bullet item
// - **text** → bold
function renderAiContent(text: string): ReactNode {
  const lines = text.split('\n');
  const nodes: ReactNode[] = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      // Only add spacer if not first/last and prev wasn't also spacer
      if (i > 0 && i < lines.length - 1) {
        nodes.push(<span key={key++} className={styles.contentSpacer} />);
      }
      continue;
    }

    const bulletMatch = trimmed.match(/^([•\-\*])\s+(.*)/);
    if (bulletMatch) {
      nodes.push(
        <div key={key++} className={styles.bulletLine}>
          <span className={styles.bulletDot} aria-hidden />
          <span>{renderInline(bulletMatch[2])}</span>
        </div>,
      );
    } else {
      nodes.push(
        <p key={key++} className={styles.contentLine}>
          {renderInline(trimmed)}
        </p>,
      );
    }
  }

  return <>{nodes}</>;
}

interface ChatMessageProps {
  message: ChatMessageData;
  isStreaming?: boolean;
  thinkingStatus?: string | null;
  onTaskCardClick?: (taskId: string) => void;
  onToggleTaskCompletion?: (taskId: string) => void;
  onListCardClick?: (listId: string) => void;
  onCategoryCardClick?: (categoryName: string) => void;
}

export function ChatMessage({
  message,
  isStreaming = false,
  thinkingStatus,
  onTaskCardClick,
  onToggleTaskCompletion,
  onListCardClick,
  onCategoryCardClick,
}: ChatMessageProps) {
  const isUser = message.role === 'user';
  const [viewing, setViewing] = useState<ChatAttachmentMeta | null>(null);

  const taskToolCalls = Array.from(
    new Map(
      (message.toolCalls || [])
        .filter(
          (tc) =>
            tc.result?.success &&
            ['create_task', 'update_task', 'complete_task', 'delete_task'].includes(tc.toolName),
        )
        .map((tc) => {
          const taskId = String(tc.result?.data?.id || '');
          const fallbackKey = JSON.stringify(tc.toolArgs || {});
          return [`${tc.toolName}:${taskId || fallbackKey}`, tc] as const;
        }),
    ).values(),
  );
  const updateTaskToolCalls = taskToolCalls.filter((tc) => tc.toolName === 'update_task');
  const shouldSummarizeTaskUpdates = updateTaskToolCalls.length > 1;
  const visibleTaskToolCalls = shouldSummarizeTaskUpdates
    ? taskToolCalls.filter((tc) => tc.toolName !== 'update_task')
    : taskToolCalls;

  const listToolCalls = (message.toolCalls || []).filter(
    (tc) => tc.result?.success && tc.toolName === 'show_list',
  );

  const categoryToolCalls = (message.toolCalls || []).filter(
    (tc) => tc.result?.success && tc.toolName === 'show_category',
  );

  const attachments = message.attachments ?? [];
  const hasReasoning =
    Boolean(message.reasoning?.trim()) || Boolean(message.reasoningSegments?.length);
  const showThinkingBlock = !isUser && (isStreaming || hasReasoning);

  return (
    <div className={`${styles.messageRow} ${isUser ? styles.messageRowUser : styles.messageRowAi}`}>
      {isUser && attachments.length > 0 && (
        <div className={styles.messageAttachments}>
          {attachments.map((a, i) => {
            const canPreview = Boolean(a.previewUrl);
            const chipContent = (
              <>
                <FileText size={14} weight="fill" className={styles.attachmentChipIcon} />
                <span className={styles.attachmentChipName}>{a.name}</span>
              </>
            );
            return canPreview ? (
              <button
                key={`${message.id}-att-${i}`}
                type="button"
                className={`${styles.messageAttachmentChip} ${styles.messageAttachmentChipButton}`}
                title={`Visualizar ${a.name}`}
                onClick={() => setViewing(a)}
              >
                {chipContent}
              </button>
            ) : (
              <div key={`${message.id}-att-${i}`} className={styles.messageAttachmentChip} title={a.name}>
                {chipContent}
              </div>
            );
          })}
        </div>
      )}

      {showThinkingBlock && (
        <ThinkingBlock
          isLive={isStreaming}
          status={thinkingStatus ?? undefined}
          reasoning={message.reasoning}
          reasoningSegments={message.reasoningSegments}
        />
      )}

      {(!isUser || message.content) && (
        <div className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleAi}`}>
          {message.content && (
            isUser
              ? <p className={styles.bubbleText}>{message.content}</p>
              : <div className={styles.aiContent}>{renderAiContent(message.content)}</div>
          )}
        </div>
      )}

      {visibleTaskToolCalls.map((tc, i) => (
        <TaskCardMessage
          key={`${message.id}-tc-${i}`}
          toolCall={tc}
          onTaskClick={onTaskCardClick}
          onToggleCompletion={onToggleTaskCompletion}
        />
      ))}

      {shouldSummarizeTaskUpdates && (
        <div className={styles.taskCard}>
          <div className={styles.taskCardHeader}>
            <span className={styles.taskCardTitle}>
              {updateTaskToolCalls.length} tarefas atualizadas
            </span>
          </div>
        </div>
      )}

      {listToolCalls.map((tc, i) => (
        <ListCardMessage key={`${message.id}-lc-${i}`} toolCall={tc} onListClick={onListCardClick} />
      ))}

      {categoryToolCalls.map((tc, i) => (
        <CategoryCardMessage key={`${message.id}-cc-${i}`} toolCall={tc} onCategoryClick={onCategoryCardClick} />
      ))}

      {!isUser && message.contentAfter && (
        <div className={`${styles.bubble} ${styles.bubbleAi}`}>
          <div className={styles.aiContent}>{renderAiContent(message.contentAfter)}</div>
        </div>
      )}

      {viewing?.previewUrl && (
        <AttachmentViewer
          attachment={{
            name: viewing.name,
            mimeType: viewing.mimeType,
            previewUrl: viewing.previewUrl,
          }}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
