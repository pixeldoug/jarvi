import { Clock, Trash } from '@phosphor-icons/react';
import type { Task } from '../../../../contexts/TaskContext';
import { Button, Chip } from '../../../ui';

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
}: {
  task: Task;
  onDelete?: () => void;
}) {
  return (
    <>
      <Chip
        label={formatCreatedChip(new Date(task.created_at))}
        icon={<Clock size={16} weight="regular" />}
        size="medium"
        chipStyle="filled"
      />
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
