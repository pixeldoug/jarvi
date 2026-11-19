import { Clock, ClockCounterClockwise, Trash } from '@phosphor-icons/react';
import type { Task } from '../../../../contexts/TaskContext';
import { Button, Chip, Tooltip } from '../../../ui';

function formatCreatedChip(date: Date): string {
  const day = date.getDate();
  const month = date.toLocaleDateString('pt-BR', { month: 'short' })
    .replace('.', '')
    .replace(/^./, str => str.toUpperCase());
  const year = String(date.getFullYear()).slice(-2);
  return `Criada em ${day} ${month}, ${year}`;
}

export function TaskDetailsFooter({
  task,
  onDelete,
  onShowVersions,
}: {
  task: Task;
  onDelete?: () => void;
  /** Opens "Versões anteriores" (passed when the description has any) */
  onShowVersions?: () => void;
}) {
  return (
    <>
      <Chip
        label={formatCreatedChip(new Date(task.created_at))}
        icon={<Clock size={16} weight="regular" />}
        size="medium"
        chipStyle="filled"
      />
      {onShowVersions && (
        <Tooltip label="Versões anteriores" position="top" showDelay={300}>
          <Button
            variant="ghost"
            icon={ClockCounterClockwise}
            iconPosition="icon-only"
            onClick={onShowVersions}
            aria-label="Versões anteriores da descrição"
          />
        </Tooltip>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          icon={Trash}
          iconPosition="icon-only"
          onClick={onDelete}
          aria-label="Excluir tarefa"
        />
      )}
    </>
  );
}
