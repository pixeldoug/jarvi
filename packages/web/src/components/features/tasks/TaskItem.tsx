import React, { useState, useRef, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task } from '../../../contexts/TaskContext';
import { CategoryBadge, CategoryDropdown } from '../../ui';
import { PencilSimple, DotsSixVertical, Calendar, Fire, Tag, Trash } from 'phosphor-react';

interface TaskItemProps {
  task: Task;
  section: string;
  onToggleCompletion: (taskId: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onUpdateTask: (taskId: string, taskData: any) => Promise<void>;
  onOpenDatePicker?: (task: Task, triggerElement?: HTMLElement) => void;
  showInsertionLine?: boolean;
}

export const TaskItem: React.FC<TaskItemProps> = ({
  task,
  section,
  onToggleCompletion,
  onEdit,
  onDelete,
  onUpdateTask,
  onOpenDatePicker,
  showInsertionLine = false,
}) => {
  const [editingInlineTaskId, setEditingInlineTaskId] = useState<string | null>(null);
  const [inlineEditValue, setInlineEditValue] = useState('');
  const [isHovered, setIsHovered] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const datePickerTriggerRef = useRef<HTMLDivElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  // Fechar dropdown quando clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setShowCategoryDropdown(false);
      }
    };

    if (showCategoryDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showCategoryDropdown]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: task.id,
    data: {
      task: task,
      section: section,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1, // Invisível durante drag para evitar duplicação
    zIndex: isDragging ? -1 : 'auto', // Atrás durante drag
  };

  // Removido - não precisamos mais da lógica complexa do popover

  const isOverdue = section === 'vencidas';

  const startInlineEdit = (task: Task) => {
    setEditingInlineTaskId(task.id);
    setInlineEditValue(task.title);
  };

  const cancelInlineEdit = () => {
    setEditingInlineTaskId(null);
    setInlineEditValue('');
  };

  const saveInlineEdit = async (taskId: string) => {
    const trimmedTitle = inlineEditValue.trim();
    if (!trimmedTitle) {
      cancelInlineEdit();
      return;
    }

    // Fechar o modo de edição imediatamente para feedback visual
    setEditingInlineTaskId(null);
    setInlineEditValue('');

    try {
      // Buscar a tarefa atual para preservar outros campos
      const currentTask = task;

      // Preparar dados para atualização - apenas campos necessários
      const updateData: any = { 
        title: trimmedTitle,
        description: currentTask.description,
        priority: currentTask.priority,
        category: currentTask.category,
        completed: currentTask.completed
      };

      // Só incluir dueDate se existir - otimizado
      if (currentTask.due_date) {
        updateData.dueDate = currentTask.due_date.split('T')[0]; // Mais rápido que new Date()
      }

      // Atualizar com loading desabilitado para ser mais rápido
      await onUpdateTask(taskId, updateData);
    } catch (error) {
      console.error('Failed to update task title:', error);
      // Reverter o estado se houver erro
      setEditingInlineTaskId(taskId);
      setInlineEditValue(trimmedTitle);
    }
  };


  // handleDateSelect removido - agora é feito em Tasks.tsx


  return (
    <>
      {/* Linha de inserção */}
      {showInsertionLine && (
        <div className="h-0.5 bg-blue-500 mx-3 rounded-full animate-pulse" />
      )}
      
      <div
        ref={setNodeRef}
        style={style}
        className={`relative flex items-center py-2 px-3 transition-all duration-200 group ${
          isDragging 
            ? 'bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600' 
            : 'hover:bg-gray-100/60 dark:hover:bg-gray-700/40 bg-transparent hover:rounded-[4px] hover:shadow-sm'
        }`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
      {/* DRAG HANDLE - Colado no lado esquerdo do task item */}
      <div 
        className={`absolute -left-8 top-0 bottom-0 flex items-center justify-center w-8 px-1 cursor-grab active:cursor-grabbing transition-all duration-200 ${
          isHovered ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
        }`}
        style={{ pointerEvents: 'auto' }}
        {...attributes}
        {...listeners}
      >
        <div className="w-6 h-6 rounded bg-gray-200 dark:bg-gray-600 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors">
          <DotsSixVertical className="w-4 h-4 text-gray-600 dark:text-gray-300" />
        </div>
      </div>

      {/* Círculo de Conclusão */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleCompletion(task.id);
        }}
        className={`w-6 h-6 rounded-full border-2 transition-all duration-300 ease-in-out hover:scale-110 active:scale-95 cursor-pointer flex items-center justify-center flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
          task.completed
            ? 'bg-blue-600 border-blue-600 hover:bg-blue-700 hover:border-blue-700 shadow-sm'
            : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:shadow-sm'
        }`}
        aria-label={task.completed ? 'Marcar como não concluída' : 'Marcar como concluída'}
      >
        {task.completed ? (
          <svg
            className="w-4 h-4 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 13l4 4L19 7" />
          </svg>
        ) : null}
      </button>
      
      {/* Título - Edição inline */}
      <div className="flex-1 min-w-0 mx-3">
        {editingInlineTaskId === task.id ? (
          <input
            key={`${task.id}-inline-edit`}
            type="text"
            value={inlineEditValue}
            onChange={(e) => setInlineEditValue(e.target.value)}
            onBlur={() => saveInlineEdit(task.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                saveInlineEdit(task.id);
              } else if (e.key === 'Escape') {
                cancelInlineEdit();
              }
              e.stopPropagation();
            }}
            className="w-full bg-white dark:bg-gray-800 border border-blue-400 rounded px-2 py-1 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        ) : (
          <h3 
            className={`font-normal cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${
              task.completed 
                ? 'line-through text-gray-500 dark:text-gray-400' 
                : 'text-gray-900 dark:text-gray-100'
            }`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              startInlineEdit(task);
            }}
            title="Clique para editar o título"
          >
            {task.title}
          </h3>
        )}
      </div>
      
      {/* Tags + Botão de Edição */}
      <div className="flex items-center space-x-2 flex-shrink-0">
        {/* Ícone de Importante */}
        {Boolean(task.important) && (
          <Fire 
            className="w-4 h-4 text-red-500 flex-shrink-0" 
            weight="fill"
          />
        )}
        
        <div className="relative" ref={categoryDropdownRef}>
          {showCategoryDropdown ? (
            <CategoryDropdown
              value={task.category || ''}
              onChange={async (category) => {
                try {
                  await onUpdateTask(task.id, { category });
                  setShowCategoryDropdown(false);
                } catch (error) {
                  console.error('Erro ao atualizar categoria:', error);
                }
              }}
              placeholder="Selecione uma categoria"
              className="w-32"
            />
          ) : (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowCategoryDropdown(true);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="hover:opacity-80 transition-opacity cursor-pointer"
            >
              {task.category && task.category.trim() ? (
                <CategoryBadge 
                  categoryName={task.category} 
                  size="sm" 
                  variant="default"
                />
              ) : (
                <div className="flex items-center space-x-1 text-xs px-2 py-1 rounded-full border border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors cursor-pointer">
                  <Tag className="w-3 h-3" />
                  <span>Categoria</span>
                </div>
              )}
            </button>
          )}
        </div>
        
        
        {task.due_date ? (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (onOpenDatePicker) {
                onOpenDatePicker(task, e.currentTarget as HTMLElement);
              }
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className={`text-xs px-2 py-1 rounded-full transition-colors cursor-pointer ${
              isOverdue 
                ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 hover:bg-red-200 dark:hover:bg-red-900/50' 
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
            title="Clique para alterar a data"
          >
            {(() => {
              try {
                let date: Date;
                if (task.due_date.includes('T')) {
                  // Para datas com timestamp, extrair apenas a parte da data (YYYY-MM-DD)
                  const dateOnly = task.due_date.split('T')[0];
                  const [year, month, day] = dateOnly.split('-').map(Number);
                  date = new Date(year, month - 1, day); // month é 0-indexed, usar timezone local
                } else {
                  // Para datas simples (YYYY-MM-DD), usar diretamente
                  const [year, month, day] = task.due_date.split('-').map(Number);
                  date = new Date(year, month - 1, day); // month é 0-indexed
                }
                
                if (isNaN(date.getTime())) {
                  console.error('Invalid date:', task.due_date);
                  return 'Data inválida';
                }
                
                const day = date.getDate();
                const month = date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').replace(/^./, str => str.toUpperCase());
                const dateStr = `${day} ${month}`;
                
                // Adicionar horário se disponível
                if (task.time) {
                  return `${dateStr} ${task.time}`;
                }
                
                return dateStr;
              } catch (error) {
                console.error('Erro ao processar data da tarefa:', task.due_date, error);
                return 'Data inválida';
              }
            })()}
          </button>
        ) : section === 'algum-dia' ? (
          <div
            ref={datePickerTriggerRef}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onMouseUp={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (onOpenDatePicker) {
                onOpenDatePicker(task, e.currentTarget as HTMLElement);
              }
            }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="flex items-center space-x-1 text-xs px-2 py-1 rounded-full border border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors cursor-pointer"
            style={{ pointerEvents: 'auto' }}
          >
            <Calendar className="w-3 h-3" />
            <span>Definir</span>
          </div>
        ) : null}
        
        {/* Botão de Edição */}
        <button 
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onEdit(task);
          }}
          className="cursor-pointer p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors flex-shrink-0"
          title="Editar tarefa"
        >
          <PencilSimple className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
        </button>
        
        {/* Botão de Deletar */}
        <button 
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(task.id);
          }}
          className="cursor-pointer p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded transition-colors flex-shrink-0"
          title="Deletar tarefa"
        >
          <Trash className="w-4 h-4 text-gray-400 hover:text-red-600 dark:hover:text-red-400" />
        </button>
      </div>
      </div>
      
      {/* DatePickerPopover agora é renderizado globalmente em Tasks.tsx */}
    </>
  );
};