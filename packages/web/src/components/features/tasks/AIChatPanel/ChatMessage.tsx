import type { ReactNode } from 'react';
import type { ChatMessageData } from '../../../../hooks/useChatStream';
import { TaskCardMessage } from './TaskCardMessage';
import styles from './AIChatPanel.module.css';

// Renders **bold** markers within a line of text
function renderInline(text: string): ReactNode[] {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part,
  );
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
}

export function ChatMessage({ message, onTaskCardClick }: ChatMessageProps) {
  const isUser = message.role === 'user';

  const taskToolCalls = (message.toolCalls || []).filter(
    (tc) =>
      tc.result?.success &&
      ['create_task', 'update_task', 'complete_task'].includes(tc.toolName),
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

      {!isUser && message.contentAfter && (
        <div className={`${styles.bubble} ${styles.bubbleAi}`}>
          <div className={styles.aiContent}>{renderAiContent(message.contentAfter)}</div>
        </div>
      )}
    </div>
  );
}
