import { useMemo, useState } from 'react';
import { Button, TextInput, Textarea } from '../../../../components/ui';
import { PendingTask } from '../../../../hooks/usePendingTasks';
import styles from './PendingTaskCard.module.css';

interface PendingTaskUpdatePayload {
  title?: string;
  description?: string | null;
  priority?: 'low' | 'medium' | 'high' | null;
  dueDate?: string | null;
  time?: string | null;
  category?: string | null;
  important?: boolean;
}

interface PendingTaskCardProps {
  task: PendingTask;
  onConfirm: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  onUpdate: (id: string, updates: PendingTaskUpdatePayload) => Promise<void>;
}

const priorityLabelMap: Record<'low' | 'medium' | 'high', string> = {
  low: 'Baixa',
  medium: 'Media',
  high: 'Alta',
};

const sourceLabelMap: Record<string, string> = {
  gmail: 'Gmail',
  whatsapp: 'WhatsApp',
};

const formatDate = (value: string | null): string => {
  if (!value) return 'Sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data';
  return date.toLocaleDateString('pt-BR');
};

const toDateInputValue = (value: string | null): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0];
};

export const PendingTaskCard: React.FC<PendingTaskCardProps> = ({
  task,
  onConfirm,
  onReject,
  onUpdate,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(task.suggested_title);
  const [description, setDescription] = useState(task.suggested_description || '');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | ''>(
    task.suggested_priority || ''
  );
  const [dueDate, setDueDate] = useState(toDateInputValue(task.suggested_due_date));
  const [time, setTime] = useState(task.suggested_time || '');
  const [category, setCategory] = useState(task.suggested_category || '');
  const [important, setImportant] = useState(task.suggested_important || false);

  const priorityLabel = useMemo(() => {
    if (!task.suggested_priority) return 'Nao definida';
    return priorityLabelMap[task.suggested_priority] || 'Nao definida';
  }, [task.suggested_priority]);

  const sourceLabel = useMemo(
    () => sourceLabelMap[task.source] || task.source || 'Canal desconhecido',
    [task.source]
  );

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm(task.id);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    setIsSubmitting(true);
    try {
      await onReject(task.id);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEdit = async () => {
    setIsSubmitting(true);
    try {
      await onUpdate(task.id, {
        title: title.trim(),
        description: description.trim() || null,
        priority: priority || null,
        dueDate: dueDate || null,
        time: time || null,
        category: category.trim() || null,
        important,
      });
      setIsEditing(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelEdit = () => {
    setTitle(task.suggested_title);
    setDescription(task.suggested_description || '');
    setPriority(task.suggested_priority || '');
    setDueDate(toDateInputValue(task.suggested_due_date));
    setTime(task.suggested_time || '');
    setCategory(task.suggested_category || '');
    setImportant(task.suggested_important || false);
    setIsEditing(false);
  };

  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <p className={styles.title}>{task.suggested_title}</p>
        <span className={styles.badge}>Via {sourceLabel}</span>
      </div>

      {!isEditing && (
        <div className={styles.meta}>
          <span>Data: {formatDate(task.suggested_due_date)}</span>
          <span>Hora: {task.suggested_time || 'Sem horario'}</span>
          <span>Prioridade: {priorityLabel}</span>
          <span>Categoria: {task.suggested_category || 'Sem categoria'}</span>
          <span>Importante: {task.suggested_important ? 'Sim' : 'Nao'}</span>
        </div>
      )}

      {!isEditing && task.suggested_description && (
        <p className={styles.description}>{task.suggested_description}</p>
      )}

      {isEditing && (
        <div className={styles.editForm}>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titulo" />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descricao"
            rows={3}
          />
          <div className={styles.grid}>
            <label className={styles.field}>
              <span>Prioridade</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high' | '')}
              >
                <option value="">Nao definida</option>
                <option value="low">Baixa</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
              </select>
            </label>

            <label className={styles.field}>
              <span>Categoria</span>
              <TextInput
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Ex: Trabalho"
              />
            </label>

            <label className={styles.field}>
              <span>Data</span>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>

            <label className={styles.field}>
              <span>Hora</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>

            <label className={styles.checkboxField}>
              <input
                type="checkbox"
                checked={important}
                onChange={(e) => setImportant(e.target.checked)}
              />
              <span>Importante</span>
            </label>
          </div>
        </div>
      )}

      <div className={styles.actions}>
        {!isEditing ? (
          <Button variant="ghost" onClick={() => setIsEditing(true)} disabled={isSubmitting}>
            Editar
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={handleCancelEdit} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button variant="secondary" onClick={handleSaveEdit} disabled={isSubmitting}>
              Salvar
            </Button>
          </>
        )}

        <Button variant="destructive" onClick={handleReject} disabled={isSubmitting}>
          Rejeitar
        </Button>
        <Button onClick={handleConfirm} disabled={isSubmitting}>
          Confirmar
        </Button>
      </div>
    </article>
  );
};
