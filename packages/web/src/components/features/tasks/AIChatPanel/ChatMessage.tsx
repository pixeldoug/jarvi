import { useState, type ReactNode } from 'react';
import { FileText } from '@phosphor-icons/react';
import type { ChatMessageData, ChatAttachmentMeta, ToolCallData } from '../../../../hooks/useChatStream';
import { resolveChatChoiceArtifact } from '../../../../lib/chatChoicePrompts';
import { coalesceAssistantBodies } from '../../../../lib/chatAssistantText';
import { capitalizeTaskTitle } from '../../../../lib/taskTitle';
import { splitTaskRefs } from '../../../../lib/taskRefs';
import { TaskCardMessage } from './TaskCardMessage';
import { ListCardMessage } from './ListCardMessage';
import { CategoryCardMessage } from './CategoryCardMessage';
import { TaskMention } from './TaskMention';
import { ThinkingBlock } from './ThinkingBlock';
import { AttachmentViewer } from '../../../ui/AttachmentViewer';
import { Button } from '../../../ui';
import styles from './AIChatPanel.module.css';

/** create / update / complete render as Figma inline mentions, not the old chip. */
const INLINE_TASK_TOOLS = ['create_task', 'update_task', 'complete_task'];

export interface InlineTaskMention {
  id: string;
  title: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findMentionInText(
  text: string,
  mentions: InlineTaskMention[],
): { index: number; length: number; mention: InlineTaskMention } | null {
  let best: { index: number; length: number; mention: InlineTaskMention } | null = null;
  for (const mention of mentions) {
    if (!mention.title) continue;
    const pattern = new RegExp(
      `(?:\\*\\*)?["']?${escapeRegExp(mention.title)}["']?(?:\\*\\*)?`,
      'i',
    );
    const match = text.match(pattern);
    if (match?.index == null) continue;
    if (!best || match.index < best.index) {
      best = { index: match.index, length: match[0].length, mention };
    }
  }
  return best;
}

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

function renderLineWithMentions(
  line: string,
  mentions: InlineTaskMention[],
  onTaskClick?: (taskId: string) => void,
): { nodes: ReactNode; usedIds: string[] } {
  const usedIds: string[] = [];
  const remainingMentions = [...mentions];
  const parts: ReactNode[] = [];
  let key = 0;

  const consumeMention = (id: string, title: string) => {
    usedIds.push(id);
    const usedIndex = remainingMentions.findIndex(
      (item) => (id && item.id === id) || item.title.toLowerCase() === title.toLowerCase(),
    );
    if (usedIndex >= 0) remainingMentions.splice(usedIndex, 1);
  };

  // Title-based matching (legacy: the model wrote the title in prose).
  const pushTextWithTitleMentions = (text: string) => {
    let remaining = text;
    while (remaining.length > 0 && remainingMentions.length > 0) {
      const found = findMentionInText(remaining, remainingMentions);
      if (!found) break;

      if (found.index > 0) {
        parts.push(<span key={`t-${key++}`}>{renderInline(remaining.slice(0, found.index))}</span>);
      }
      parts.push(
        <TaskMention
          key={`m-${key++}`}
          title={found.mention.title}
          onClick={onTaskClick && found.mention.id ? () => onTaskClick(found.mention.id) : undefined}
        />,
      );
      consumeMention(found.mention.id, found.mention.title);
      remaining = remaining.slice(found.index + found.length);
    }
    if (remaining) {
      parts.push(<span key={`t-${key++}`}>{renderInline(remaining)}</span>);
    }
  };

  // Structured references first: `{{task:id|Title}}` written by the backend.
  for (const segment of splitTaskRefs(line)) {
    if (segment.type === 'task') {
      const { id, title } = segment.ref;
      parts.push(
        <TaskMention
          key={`m-${key++}`}
          title={capitalizeTaskTitle(title)}
          onClick={onTaskClick && id ? () => onTaskClick(id) : undefined}
        />,
      );
      consumeMention(id, title);
      continue;
    }
    pushTextWithTitleMentions(segment.text);
  }

  return { nodes: <>{parts}</>, usedIds };
}

function mentionNode(
  mention: InlineTaskMention,
  onTaskClick?: (taskId: string) => void,
): ReactNode {
  return (
    <TaskMention
      key={mention.id || mention.title}
      title={mention.title}
      onClick={onTaskClick && mention.id ? () => onTaskClick(mention.id) : undefined}
    />
  );
}

function renderAiContent(
  text: string,
  mentions: InlineTaskMention[] = [],
  onTaskClick?: (taskId: string) => void,
): ReactNode {
  const lines = text.split('\n');
  const built: Array<
    | { type: 'spacer' }
    | { type: 'bullet'; nodes: ReactNode }
    | { type: 'text'; nodes: ReactNode }
  > = [];
  const unused = [...mentions];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (trimmed === '') {
      if (i > 0 && i < lines.length - 1) built.push({ type: 'spacer' });
      continue;
    }

    // A bullet keeps its dot and renders the rest with mentions, so
    // "• {{task:id|Pagar IRPF}}. Está com prioridade alta." is a real bullet
    // with a clickable task inside it.
    const bulletMatch = trimmed.match(/^([•\-\*])\s+(.*)/);
    const body = bulletMatch ? bulletMatch[2] : trimmed;

    const { nodes: lineNodes, usedIds } = renderLineWithMentions(body, unused, onTaskClick);
    for (const id of usedIds) {
      const idx = unused.findIndex((item) => item.id === id);
      if (idx >= 0) unused.splice(idx, 1);
    }

    built.push({ type: bulletMatch ? 'bullet' : 'text', nodes: lineNodes });
  }

  if (unused.length > 0) {
    const extras = unused.map((mention) => mentionNode(mention, onTaskClick));
    const lastText = [...built].reverse().find((item) => item.type === 'text');
    if (lastText && lastText.type === 'text') {
      lastText.nodes = (
        <>
          {lastText.nodes} {extras}
        </>
      );
    } else {
      built.push({ type: 'text', nodes: <>{extras}</> });
    }
  }

  return (
    <>
      {built.map((item, key) => {
        if (item.type === 'spacer') {
          return <span key={key} className={styles.contentSpacer} />;
        }
        if (item.type === 'bullet') {
          return (
            <div key={key} className={styles.bulletLine}>
              <span className={styles.bulletDot} aria-hidden />
              <span>{item.nodes}</span>
            </div>
          );
        }
        return (
          <p key={key} className={styles.contentLine}>
            {item.nodes}
          </p>
        );
      })}
    </>
  );
}

export function createdTaskMentions(toolCalls: ToolCallData[] | undefined): InlineTaskMention[] {
  if (!toolCalls?.length) return [];
  const mentions: InlineTaskMention[] = [];
  const seen = new Set<string>();
  for (const call of toolCalls) {
    if (!INLINE_TASK_TOOLS.includes(call.toolName) || !call.result?.success) continue;
    const id = String(call.result.data?.id || '');
    const title = capitalizeTaskTitle(
      String(call.result.data?.title || call.toolArgs?.title || ''),
    );
    if (!title) continue;
    const key = id || title;
    if (seen.has(key)) continue;
    seen.add(key);
    mentions.push({ id, title });
  }
  return mentions;
}

export function relatedTaskFromMessage(message: ChatMessageData | undefined): InlineTaskMention | null {
  if (!message) return null;
  // The backend named the task its question is about (e.g. the onboarding
  // journey moving on to a task nothing touched this turn).
  if (message.choiceTaskId && message.choiceTaskTitle) {
    return { id: message.choiceTaskId, title: capitalizeTaskTitle(message.choiceTaskTitle) };
  }
  if (!message.toolCalls?.length) return null;
  const candidates: InlineTaskMention[] = [];
  for (let i = message.toolCalls.length - 1; i >= 0; i--) {
    const call = message.toolCalls[i];
    if (!call.result?.success) continue;
    if (call.toolName !== 'create_task' && call.toolName !== 'update_task') continue;
    const id = String(call.result.data?.id || '');
    const title = capitalizeTaskTitle(
      String(call.result.data?.title || call.toolArgs?.title || ''),
    );
    if (title) candidates.push({ id, title });
  }
  if (candidates.length === 0) return null;
  // The backend says which task its question is about; otherwise the last one touched.
  if (message.choiceTaskId) {
    const exact = candidates.find((c) => c.id === message.choiceTaskId);
    if (exact) return exact;
  }
  return candidates[0];
}

/** Tool calls that can materialize a task artifact in the conversation. */
export const TASK_ARTIFACT_TOOLS = ['create_task', 'update_task', 'complete_task', 'delete_task'];

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
  /**
   * Resume action of the journey nudge. Only the last assistant message gets
   * it (a nudge further up in the conversation is history, not a prompt).
   */
  onJourneyResume?: () => void;
}

export function ChatMessage({
  message,
  isStreaming = false,
  thinkingStatus,
  taskArtifactOwner,
  onTaskCardClick,
  onListCardClick,
  onCategoryCardClick,
  onJourneyResume,
}: ChatMessageProps) {
  const isUser = message.role === 'user';
  const [viewing, setViewing] = useState<ChatAttachmentMeta | null>(null);

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
    if (!taskId || !taskArtifactOwner) return true;
    return taskArtifactOwner.get(taskId) === message.id;
  });
  const inlineMentions = createdTaskMentions(taskToolCalls);
  const visibleTaskToolCalls = taskToolCalls.filter(
    (tc) => !INLINE_TASK_TOOLS.includes(tc.toolName),
  );

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
  const hasChoiceArtifact = Boolean(choiceArtifact && choiceArtifact.choices.length > 0);
  const hasInlineTask = inlineMentions.length > 0;
  const coalesced = isUser
    ? { content: message.content, contentAfter: message.contentAfter || '' }
    : coalesceAssistantBodies(
        hasChoiceArtifact && choiceArtifact ? choiceArtifact.content : message.content,
        hasChoiceArtifact && choiceArtifact ? choiceArtifact.contentAfter || '' : message.contentAfter || '',
        { mergeIntoOne: hasInlineTask },
      );
  const displayContent = coalesced.content;
  const displayAfter = coalesced.contentAfter;
  const afterBubble =
    !isUser && displayAfter ? (
      <div className={`${styles.bubble} ${styles.bubbleAi}`}>
        <div className={styles.aiContent}>
          {renderAiContent(displayAfter, [], onTaskCardClick)}
        </div>
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
            : (
              <div className={styles.aiContent}>
                {renderAiContent(displayContent, inlineMentions, onTaskCardClick)}
              </div>
            )}
        </div>
      ) : inlineMentions.length > 0 ? (
        <div className={`${styles.bubble} ${styles.bubbleAi}`}>
          <div className={styles.aiContent}>
            {renderAiContent('', inlineMentions, onTaskCardClick)}
          </div>
        </div>
      ) : null}

      {hasInlineTask ? afterBubble : null}

      {visibleTaskToolCalls.map((tc, i) => (
        <TaskCardMessage
          key={`${message.id}-tc-${i}`}
          toolCall={tc}
          onTaskClick={onTaskCardClick}
        />
      ))}

      {listToolCalls.map((tc, i) => (
        <ListCardMessage key={`${message.id}-lc-${i}`} toolCall={tc} onListClick={onListCardClick} />
      ))}

      {categoryToolCalls.map((tc, i) => (
        <CategoryCardMessage key={`${message.id}-cc-${i}`} toolCall={tc} onCategoryClick={onCategoryCardClick} />
      ))}

      {!hasInlineTask ? afterBubble : null}

      {!isUser && message.journeyNudge ? (
        <div className={styles.journeyNudge}>
          <span className={styles.journeyNudgeText}>{message.journeyNudge.text}</span>
          {onJourneyResume ? (
            <Button variant="ghost" size="small" onClick={onJourneyResume}>
              {message.journeyNudge.resumeLabel}
            </Button>
          ) : null}
        </div>
      ) : null}

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
