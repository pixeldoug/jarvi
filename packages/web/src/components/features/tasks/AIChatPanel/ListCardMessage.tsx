import { FunnelSimple, Fire, Hash, WhatsappLogo, Prohibit } from '@phosphor-icons/react';
import { Chip } from '../../../ui';
import type { ToolCallData } from '../../../../hooks/useChatStream';
import styles from './AIChatPanel.module.css';

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Urgente',
};

interface ListCardMessageProps {
  toolCall: ToolCallData;
  onListClick?: (listId: string) => void;
}

export function ListCardMessage({ toolCall, onListClick }: ListCardMessageProps) {
  const data = toolCall.result?.data;
  if (!data) return null;

  const listId = String(data.id || '');
  const name = String(data.name || toolCall.toolArgs.name || '');
  if (!name) return null;

  const isDeleted = toolCall.toolName === 'delete_list';
  if (isDeleted) return null;

  const priority = String(data.priority || toolCall.toolArgs.priority || '');
  const connectedApp = String(data.connected_app || toolCall.toolArgs.connected_app || '');
  const filterNoCategory = Boolean(data.filter_no_category ?? toolCall.toolArgs.filter_no_category);
  const categoryNames: string[] = Array.isArray(data.category_names)
    ? (data.category_names as string[])
    : Array.isArray(toolCall.toolArgs.category_names)
      ? (toolCall.toolArgs.category_names as string[])
      : [];

  const priorityLabel = PRIORITY_LABELS[priority] || priority;
  const isClickable = !!listId && !!onListClick;

  const handleClick = () => {
    if (isClickable) onListClick(listId);
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
        <FunnelSimple
          size={20}
          weight="duotone"
          className={styles.taskCardCheck}
        />
        <span className={styles.taskCardTitle}>{name}</span>
      </div>

      {(categoryNames.length > 0 || priorityLabel || connectedApp || filterNoCategory) && (
        <div className={styles.taskCardChips}>
          {categoryNames.slice(0, 3).map((cat) => (
            <Chip
              key={cat}
              label={cat}
              icon={<Hash weight="regular" />}
              size="medium"
              active
            />
          ))}
          {categoryNames.length > 3 && (
            <Chip
              label={`+${categoryNames.length - 3}`}
              size="medium"
              active
            />
          )}
          {priorityLabel && (
            <Chip
              label={priorityLabel}
              icon={<Fire weight="regular" />}
              size="medium"
              active
            />
          )}
          {connectedApp === 'whatsapp' && (
            <Chip
              label="WhatsApp"
              icon={<WhatsappLogo weight="regular" />}
              size="medium"
              active
            />
          )}
          {filterNoCategory && (
            <Chip
              label="Sem categoria"
              icon={<Prohibit weight="regular" />}
              size="medium"
              active
            />
          )}
        </div>
      )}
    </div>
  );
}
