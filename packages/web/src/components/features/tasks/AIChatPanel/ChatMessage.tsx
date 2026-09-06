import { useState, type ReactNode } from 'react';
import { Checks, FileText, X } from '@phosphor-icons/react';
import type { ChatMessageData, ChatAttachmentMeta } from '../../../../hooks/useChatStream';
import { resolveChatChoiceArtifact } from '../../../../lib/chatChoicePrompts';
import { coalesceAssistantBodies } from '../../../../lib/chatAssistantText';
import { TaskCardMessage } from './TaskCardMessage';
import { ListCardMessage } from './ListCardMessage';
import { CategoryCardMessage } from './CategoryCardMessage';
import { ThinkingBlock } from './ThinkingBlock';
import { AttachmentViewer } from '../../../ui/AttachmentViewer';
import styles from './AIChatPanel.module.css';

// Renders **bold**, `code`, and "quoted names" within a line of text.
// "quoted" segments are rendered as code pills without the surrounding quotes.
function renderInline(text: string): ReactNode[] {
  const segments = text.split(/(\*\*.*?\*\*|`[^`]+`|"[^"]+"|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g);
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
    const mdLink = seg.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (mdLink) {
      return (
        <a
          key={i}
          className={styles.inlineLink}
          href={mdLink[2]}
          target="_blank"
          rel="noopener noreferrer"
        >
          {mdLink[1]}
        </a>
      );
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

/** Tool calls that can materialize a task artifact in the conversation. */
export const TASK_ARTIFACT_TOOLS = ['create_task', 'update_task', 'complete_task', 'delete_task'];
// complete_onboarding_journey is silent: omitted from SSE and never listed here.}

interface ChatMessageProps {
  message: ChatMessageData;
  isStreaming?: boolean;
  thinkingStatus?: string | null;
  /**
   * Task id → id of the message allowed to render its artifact. Built once per
   * conversation by the panel so an entity is only ever drawn once.
   */
  taskArtifactOwner?: Map<string, string>;
  onTaskCardClick?: (taskId: string) => void;
  onListCardClick?: (listId: string) => void;
  onCategoryCardClick?: (categoryName: string) => void;
  onChoiceSelect?: (text: string) => void;
  choicesDisabled?: boolean;
}

export function ChatMessage({
  message,
  isStreaming = false,
  thinkingStatus,
  taskArtifactOwner,
  onTaskCardClick,
  onListCardClick,
  onCategoryCardClick,
  onChoiceSelect,
  choicesDisabled = false,
}: ChatMessageProps) {
  const isUser = message.role === 'user';
  const [viewing, setViewing] = useState<ChatAttachmentMeta | null>(null);
  const [choicesDismissed, setChoicesDismissed] = useState(false);

  // One artifact per task entity: several calls on the same task within a turn
  // collapse into the last one, which carries the final state.
  const taskToolCalls = Array.from(
    new Map(
      (message.toolCalls || [])
        .filter((tc) => tc.result?.success && TASK_ARTIFACT_TOOLS.includes(tc.toolName))
        .map((tc) => {
          const taskId = String(tc.result?.data?.id || '');
          const fallbackKey = JSON.stringify(tc.toolArgs || {});
          return [taskId || fallbackKey, tc] as const;
        }),
    ).values(),
  ).filter((tc) => {
    const taskId = String(tc.result?.data?.id || '');
    // Without an id there is nothing to track across turns, so keep it.
    if (!taskId || !taskArtifactOwner) return true;
    return taskArtifactOwner.get(taskId) === message.id;
  });
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
  const choiceArtifact = isUser ? null : resolveChatChoiceArtifact(message);
  const choicePrompts = choiceArtifact?.choices ?? [];
  const choicePromptTitle = choiceArtifact?.question;
  const showChoiceCard =
    !isUser &&
    !choicesDismissed &&
    !choicesDisabled &&
    Boolean(onChoiceSelect) &&
    choicePrompts.length > 0;
  const hasCreatedTask = visibleTaskToolCalls.some((tc) => tc.toolName === 'create_task');
  const coalesced = isUser
    ? { content: message.content, contentAfter: message.contentAfter || '' }
    : coalesceAssistantBodies(
        showChoiceCard && choiceArtifact ? choiceArtifact.content : message.content,
        showChoiceCard && choiceArtifact ? choiceArtifact.contentAfter || '' : message.contentAfter || '',
        { mergeIntoOne: hasCreatedTask },
      );
  const displayContent = coalesced.content;
  const displayAfter = coalesced.contentAfter;
  const afterBubble =
    !isUser && displayAfter ? (
      <div className={`${styles.bubble} ${styles.bubbleAi}`}>
        <div className={styles.aiContent}>{renderAiContent(displayAfter)}</div>
      </div>
    ) : null;

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

      {displayContent ? (
        <div className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleAi}`}>
          {isUser
            ? <p className={styles.bubbleText}>{displayContent}</p>
            : <div className={styles.aiContent}>{renderAiContent(displayContent)}</div>}
        </div>
      ) : null}

      {hasCreatedTask ? afterBubble : null}

      {visibleTaskToolCalls.map((tc, i) => (
        <TaskCardMessage
          key={`${message.id}-tc-${i}`}
          toolCall={tc}
          onTaskClick={onTaskCardClick}
        />
      ))}

      {shouldSummarizeTaskUpdates && (
        <div className={styles.taskRef}>
          <Checks size={16} weight="regular" className={styles.taskRefIcon} aria-hidden />
          <span className={styles.taskRefTitle}>
            {updateTaskToolCalls.length} tarefas atualizadas
          </span>
        </div>
      )}

      {listToolCalls.map((tc, i) => (
        <ListCardMessage key={`${message.id}-lc-${i}`} toolCall={tc} onListClick={onListCardClick} />
      ))}

      {categoryToolCalls.map((tc, i) => (
        <CategoryCardMessage key={`${message.id}-cc-${i}`} toolCall={tc} onCategoryClick={onCategoryCardClick} />
      ))}

      {!hasCreatedTask ? afterBubble : null}

      {!isUser && showChoiceCard && (
        <div className={styles.choiceCard}>
          <div className={styles.choiceHeader}>
            {choicePromptTitle ? (
              <p className={styles.choiceTitle}>{choicePromptTitle}</p>
            ) : (
              <span className={styles.choiceTitleSpacer} />
            )}
            <button
              type="button"
              className={styles.choiceDismiss}
              aria-label="Dispensar opções"
              onClick={() => setChoicesDismissed(true)}
            >
              <X size={14} weight="bold" />
            </button>
          </div>
          <div className={styles.choiceList}>
            {choicePrompts.map((choice, index) => {
              const letter = String.fromCharCode(65 + index);
              return (
                <button
                  key={`${message.id}-choice-${index}`}
                  type="button"
                  className={styles.choiceOption}
                  disabled={choicesDisabled || !onChoiceSelect}
                  onClick={() => onChoiceSelect?.(choice)}
                >
                  <span className={styles.choiceLetter}>{letter}</span>
                  <span className={styles.choiceLabel}>{choice}</span>
                </button>
              );
            })}
          </div>
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
