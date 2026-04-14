import { Tag } from '@phosphor-icons/react';
import type { ToolCallData } from '../../../../hooks/useChatStream';
import styles from './AIChatPanel.module.css';

interface CategoryCardMessageProps {
  toolCall: ToolCallData;
  onCategoryClick?: (categoryName: string) => void;
}

export function CategoryCardMessage({ toolCall, onCategoryClick }: CategoryCardMessageProps) {
  const data = toolCall.result?.data;
  if (!data) return null;

  const name = String(data.name || toolCall.toolArgs.name || '');
  if (!name) return null;

  const color = String(data.color || toolCall.toolArgs.color || '');
  const isClickable = !!name && !!onCategoryClick;

  const handleClick = () => {
    if (isClickable) onCategoryClick(name);
  };

  return (
    <div
      className={`${styles.taskCard} ${isClickable ? styles.taskCardClickable : ''}`}
      onClick={handleClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => e.key === 'Enter' && handleClick() : undefined}
    >
      <div className={styles.taskCardHeader}>
        {color ? (
          <span
            className={styles.taskCardCheck}
            style={{
              display: 'inline-block',
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: color,
              flexShrink: 0,
            }}
          />
        ) : (
          <Tag size={20} weight="duotone" className={styles.taskCardCheck} />
        )}
        <span className={styles.taskCardTitle}>{name}</span>
      </div>
    </div>
  );
}
