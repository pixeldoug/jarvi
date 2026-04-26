import type { ReactNode } from 'react';
import type { ChatMessageData } from '../../../../hooks/useChatStream';
import { TaskCardMessage } from './TaskCardMessage';
import { ListCardMessage } from './ListCardMessage';
import { CategoryCardMessage } from './CategoryCardMessage';
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
  onTaskCardClick?: (taskId: string) => void;
  onListCardClick?: (listId: string) => void;
  onCategoryCardClick?: (categoryName: string) => void;
}

export function ChatMessage({ message, onTaskCardClick, onListCardClick, onCategoryCardClick }: ChatMessageProps) {
  const isUser = message.role === 'user';

  const taskToolCalls = Array.from(
    new Map(
      (message.toolCalls || [])
        .filter(
          (tc) =>
            tc.result?.success &&
            ['create_task', 'update_task', 'complete_task'].includes(tc.toolName),
        )
        .map((tc) => {
          const taskId = String(tc.result?.data?.id || '');
          const fallbackKey = JSON.stringify(tc.toolArgs || {});
          return [`${tc.toolName}:${taskId || fallbackKey}`, tc] as const;
        }),
    ).values(),
  );

  const listToolCalls = (message.toolCalls || []).filter(
    (tc) => tc.result?.success && tc.toolName === 'show_list',
  );

  const categoryToolCalls = (message.toolCalls || []).filter(
    (tc) => tc.result?.success && tc.toolName === 'show_category',
  );

  return (
    <div className={`${styles.messageRow} ${isUser ? styles.messageRowUser : styles.messageRowAi}`}>
      <div className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleAi}`}>
        {message.content && (
          isUser
            ? <p className={styles.bubbleText}>{message.content}</p>
            : <div className={styles.aiContent}>{renderAiContent(message.content)}</div>
        )}
      </div>

      {taskToolCalls.map((tc, i) => (
        <TaskCardMessage key={`${message.id}-tc-${i}`} toolCall={tc} onTaskClick={onTaskCardClick} />
      ))}

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
    </div>
  );
}
