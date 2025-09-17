import React, { useState, useMemo } from 'react';
import { useTasks } from '../contexts/TaskContext';
import { useAuth } from '../contexts/AuthContext';
import { Task, CreateTaskData } from '../contexts/TaskContext';
import { Button, Input, Textarea, Select, Modal, Badge } from '../components/ui';
import { Trash, Plus } from 'phosphor-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export const Tasks: React.FC = () => {
  const { tasks, isLoading, error, createTask, updateTask, deleteTask, toggleTaskCompletion } = useTasks();
  const { user } = useAuth();

  console.log('Tasks Component - Render:', { tasks: tasks.length, isLoading, error, user: user?.email });
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState<CreateTaskData>({
    title: '',
    description: '',
    priority: 'medium',
    category: '',
    dueDate: '',
  });

  // Configurar sensores para drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createTask(formData);
      setShowCreateModal(false);
      setFormData({ title: '', description: '', priority: 'medium', category: '', dueDate: '' });
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  };

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;
    
    try {
      await updateTask(editingTask.id, formData);
      setEditingTask(null);
      setFormData({ title: '', description: '', priority: 'medium', category: '', dueDate: '' });
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (window.confirm('Are you sure you want to delete this task?')) {
      try {
        await deleteTask(taskId);
      } catch (error) {
        console.error('Failed to delete task:', error);
      }
    }
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      category: task.category || '',
      dueDate: task.due_date ? new Date(task.due_date).toISOString().split('T')[0] : '',
    });
  };

  const closeModals = () => {
    setShowCreateModal(false);
    setEditingTask(null);
    setFormData({ title: '', description: '', priority: 'medium', category: '', dueDate: '' });
  };

  // Função para lidar com drag and drop
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || !active.data.current) {
      return;
    }

    const activeTask = active.data.current.task as Task;
    const sourceSection = active.data.current.section as string;
    
    // Determinar seção de destino
    let targetSection: string | null = null;
    
    // Se o drop foi diretamente em uma seção
    if (over.data.current?.section) {
      targetSection = over.data.current.section;
    }
    // Se o drop foi em uma tarefa, determinar a seção baseada na tarefa de destino
    else if (over.data.current?.task) {
      const targetTask = over.data.current.task as Task;
      
      // Determinar a seção da tarefa de destino baseada na data
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      
      const todayStr = today.toISOString().split('T')[0];
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      
      if (!targetTask.due_date) {
        targetSection = 'algumDia';
      } else {
        const dueDate = new Date(targetTask.due_date + 'T00:00:00').toISOString().split('T')[0];
        
        if (dueDate === todayStr) {
          targetSection = 'hoje';
        } else if (dueDate === tomorrowStr) {
          targetSection = 'amanha';
        } else if (dueDate > tomorrowStr) {
          targetSection = 'eventosFuturos';
        } else {
          targetSection = 'vencidas';
        }
      }
    }

    // Se a tarefa foi movida para a mesma seção, não faz nada
    if (sourceSection === targetSection || !targetSection) {
      return;
    }

    // Determinar nova data baseada na seção de destino
    let newDueDate: string | null = null;

    // Usar as mesmas datas que o useMemo para consistência
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const futureDate = new Date(today);
    futureDate.setDate(today.getDate() + 2);

    switch (targetSection) {
      case 'hoje':
        newDueDate = today.toISOString().split('T')[0];
        break;
      case 'amanha':
        newDueDate = tomorrow.toISOString().split('T')[0];
        break;
      case 'eventosFuturos':
        newDueDate = futureDate.toISOString().split('T')[0];
        break;
      case 'algumDia':
        newDueDate = null; // Remove a data
        break;
      case 'vencidas':
        // Se mover para vencidas, define como ontem
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        newDueDate = yesterday.toISOString().split('T')[0];
        break;
    }

    // Atualizar a tarefa com nova data
    try {
      await updateTask(activeTask.id, {
        title: activeTask.title,
        description: activeTask.description,
        priority: activeTask.priority,
        category: activeTask.category,
        completed: activeTask.completed,
        dueDate: newDueDate || undefined, // Usar dueDate ao invés de due_date
      });
    } catch (error) {
      console.error('Erro ao atualizar tarefa:', error);
    }
  };

  // Função para categorizar tarefas por período
  const categorizedTasks = useMemo(() => {
    
    // Criar datas normalizadas para evitar problemas de timezone
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    // Normalizar datas para comparação (YYYY-MM-DD)
    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    
    const categorized = {
      hoje: [] as Task[],
      amanha: [] as Task[],
      eventosFuturos: [] as Task[],
      vencidas: [] as Task[],
      algumDia: [] as Task[],
    };

    tasks.forEach(task => {
      if (!task.due_date) {
        categorized.algumDia.push(task);
      } else {
        // Normalizar a data da tarefa para YYYY-MM-DD
        let dueDate: string;
        try {
          // Tentar diferentes formatos de data
          let taskDate: Date;
          if (task.due_date.includes('T')) {
            // Se já tem formato ISO, usar diretamente
            taskDate = new Date(task.due_date);
          } else {
            // Se não tem formato ISO, adicionar T00:00:00
            taskDate = new Date(task.due_date + 'T00:00:00');
          }
          
          // Verificar se a data é válida
          if (isNaN(taskDate.getTime())) {
            console.error('Invalid date in categorization:', task.due_date);
            categorized.algumDia.push(task);
            return;
          }
          
          dueDate = taskDate.toISOString().split('T')[0];
        } catch (error) {
          console.error('Erro ao processar data da tarefa:', task.due_date, error);
          categorized.algumDia.push(task);
          return;
        }
        
        
        const isToday = dueDate === todayStr;
        const isTomorrow = dueDate === tomorrowStr;
        const isFuture = dueDate > tomorrowStr;
        const isOverdue = dueDate < todayStr;
        
        
        // Lógica de categorização baseada em datas
        
        if (isToday) {
          categorized.hoje.push(task);
        } else if (isTomorrow) {
          categorized.amanha.push(task);
        } else if (isFuture) {
          categorized.eventosFuturos.push(task);
        } else if (isOverdue) {
          // Tarefas vencidas vão para seção específica
          categorized.vencidas.push(task);
        } else {
          // Fallback - não deveria acontecer
          categorized.algumDia.push(task);
        }
      }
    });


    return categorized;
  }, [tasks]);

  // Componente para seção que aceita drop
  const DroppableSection: React.FC<{ 
    title: string, 
    tasks: Task[], 
    emptyMessage: string, 
    sectionId: string 
  }> = ({ title, tasks, emptyMessage, sectionId }) => {
    const { setNodeRef, isOver } = useDroppable({
      id: sectionId,
      data: {
        section: sectionId,
      },
    });

    return (
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center">
          {title}
          <Badge variant="default" className="ml-2">
            {tasks.length}
          </Badge>
        </h2>
        <div 
          ref={setNodeRef}
          className={`space-y-1 rounded-lg border-2 border-dashed transition-all duration-200 ease-in-out ${
            tasks.length > 0 
              ? `min-h-[50px] p-1 ${
                  isOver 
                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' 
                    : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'
                }`
              : `${
                  isOver 
                    ? 'min-h-[62px] p-4 border-blue-400 bg-blue-50 dark:bg-blue-900/20' 
                    : 'min-h-0 p-0 border-transparent'
                }`
          }`}
        >
          {tasks.length > 0 ? (
            <SortableContext items={tasks.map(task => task.id)} strategy={verticalListSortingStrategy}>
              {tasks.map((task) => (
                <SortableTaskItem 
                  key={task.id} 
                  task={task} 
                  section={sectionId}
                />
              ))}
            </SortableContext>
          ) : (
            <div className={`flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm transition-all duration-200 overflow-hidden ${
              isOver ? 'h-[62px]' : 'h-0'
            }`}>
              {emptyMessage}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderTaskSection = (title: string, tasks: Task[], emptyMessage: string, sectionId: string) => {
    return (
      <DroppableSection
        title={title}
        tasks={tasks}
        emptyMessage={emptyMessage}
        sectionId={sectionId}
      />
    );
  };


  const getPriorityVariant = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'danger';
      case 'high': return 'warning';
      case 'medium': return 'info';
      case 'low': return 'success';
      default: return 'default';
    }
  };

  const getPriorityLabel = (priority: string) => {
    const labels = {
      urgent: 'Urgente',
      high: 'Alta',
      medium: 'Média',
      low: 'Baixa',
    };
    return labels[priority as keyof typeof labels] || priority;
  };

  // Componente para tarefa arrastável
  const SortableTaskItem: React.FC<{ task: Task; section: string }> = ({ task, section }) => {
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
      opacity: isDragging ? 0.5 : 1,
    };

    // Verificar se a tarefa está vencida (comparando apenas as datas, não horas)
    const todayStr = new Date().toISOString().split('T')[0];
    let taskDateStr: string | null = null;
    let isOverdue = false;
    
    if (task.due_date) {
      try {
        let date: Date;
        if (task.due_date.includes('T')) {
          date = new Date(task.due_date);
        } else {
          date = new Date(task.due_date + 'T00:00:00');
        }
        
        if (!isNaN(date.getTime())) {
          taskDateStr = date.toISOString().split('T')[0];
          isOverdue = taskDateStr < todayStr;
        }
      } catch (error) {
        console.error('Erro ao processar data da tarefa:', task.due_date, error);
      }
    }

    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={`flex items-center justify-between py-2 px-1 transition-colors cursor-grab active:cursor-grabbing hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
          task.completed 
            ? 'bg-green-50 dark:bg-green-900/10' 
            : 'bg-transparent'
        }`}
        onClick={() => {
          // Só abre o modal se não estiver arrastando
          if (!isDragging) {
            openEditModal(task);
          }
        }}
      >
        {/* Radio Button + Título */}
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <input
            type="radio"
            checked={task.completed}
            onChange={(e) => {
              e.stopPropagation(); // Evita abrir o modal ao clicar no radio
              toggleTaskCompletion(task.id);
            }}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600"
          />
          <h3 className={`font-medium truncate ${
            task.completed 
              ? 'line-through text-gray-500 dark:text-gray-400' 
              : 'text-gray-900 dark:text-gray-100'
          }`}>
            {task.title}
          </h3>
        </div>

        {/* Badges - Prioridade, Categoria, Data */}
        <div className="flex items-center space-x-2 flex-shrink-0">
          <Badge variant={getPriorityVariant(task.priority)} className="text-xs">
            {getPriorityLabel(task.priority)}
          </Badge>
          
          {task.category && (
            <Badge variant="default" className="text-xs">
              {task.category}
            </Badge>
          )}
          
          {task.due_date && (
            <div className="flex items-center space-x-1">
              <span className={`text-xs px-2 py-1 rounded-full ${
                isOverdue 
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200' 
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}>
                {(() => {
                  try {
                    // Tentar diferentes formatos de data
                    let date: Date;
                    if (task.due_date.includes('T')) {
                      // Se já tem formato ISO, usar diretamente
                      date = new Date(task.due_date);
                    } else {
                      // Se não tem formato ISO, adicionar T00:00:00
                      date = new Date(task.due_date + 'T00:00:00');
                    }
                    
                    // Verificar se a data é válida
                    if (isNaN(date.getTime())) {
                      console.error('Invalid date:', task.due_date);
                      return 'Data inválida';
                    }
                    
                    const day = date.getDate();
                    const month = date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').replace(/^./, str => str.toUpperCase());
                    return `${day} ${month}`;
                  } catch (error) {
                    console.error('Erro ao processar data da tarefa:', task.due_date, error);
                    return 'Data inválida';
                  }
                })()}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const priorityOptions = [
    { value: 'low', label: 'Baixa' },
    { value: 'medium', label: 'Média' },
    { value: 'high', label: 'Alta' },
    { value: 'urgent', label: 'Urgente' },
  ];

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Por favor, faça login para ver suas tarefas.</p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Tarefas</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Gerencie suas tarefas e mantenha-se organizado</p>
        </div>
        <Button
          onClick={() => setShowCreateModal(true)}
          icon={Plus}
          iconPosition="left"
        >
          Nova Tarefa
        </Button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-500 dark:text-gray-400">Carregando tarefas...</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 dark:text-gray-500 text-6xl mb-4">📝</div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Nenhuma tarefa ainda</h3>
          <p className="text-gray-500 dark:text-gray-400">Crie sua primeira tarefa para começar!</p>
        </div>
      ) : (
        <div className="space-y-8">

          {/* Seção Tarefas Vencidas */}
          {renderTaskSection(
            "Tarefas Vencidas", 
            categorizedTasks.vencidas, 
            "Nenhuma tarefa vencida",
            "vencidas"
          )}
          
          {/* Seção Hoje */}
          {renderTaskSection(
            "Hoje", 
            categorizedTasks.hoje, 
            "Nenhuma tarefa para hoje",
            "hoje"
          )}
          
          {/* Seção Amanhã */}
          {renderTaskSection(
            "Amanhã", 
            categorizedTasks.amanha, 
            "Nenhuma tarefa para amanhã",
            "amanha"
          )}
          
          {/* Seção Eventos Futuros */}
          {renderTaskSection(
            "Eventos Futuros", 
            categorizedTasks.eventosFuturos, 
            "Nenhum evento futuro agendado",
            "eventosFuturos"
          )}
          
          {/* Seção Algum Dia */}
          {renderTaskSection(
            "Algum Dia", 
            categorizedTasks.algumDia, 
            "Nenhuma tarefa sem prazo",
            "algumDia"
          )}
          
        </div>
      )}

      {/* Create Task Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={closeModals}
        title="Criar Nova Tarefa"
        size="md"
      >
        <form onSubmit={handleCreateTask} className="space-y-4">
          <Input
            label="Título"
            required
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Digite o título da tarefa"
          />

          <Textarea
            label="Descrição"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Digite a descrição da tarefa"
            rows={3}
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Prioridade"
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
              options={priorityOptions}
            />

            <Input
              label="Categoria"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              placeholder="Ex: Trabalho, Pessoal"
            />
          </div>

          <Input
            label="Data de Vencimento"
            type="date"
            value={formData.dueDate}
            onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
          />

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={closeModals}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
            >
              Criar Tarefa
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Task Modal */}
      <Modal
        isOpen={!!editingTask}
        onClose={closeModals}
        title="Editar Tarefa"
        size="md"
      >
        <form onSubmit={handleUpdateTask} className="space-y-4">
          <Input
            label="Título"
            required
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Digite o título da tarefa"
          />

          <Textarea
            label="Descrição"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Digite a descrição da tarefa"
            rows={3}
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Prioridade"
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
              options={priorityOptions}
            />

            <Input
              label="Categoria"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              placeholder="Ex: Trabalho, Pessoal"
            />
          </div>

          <Input
            label="Data de Vencimento"
            type="date"
            value={formData.dueDate}
            onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
          />

          <div className="flex justify-between items-center pt-4">
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                if (editingTask && window.confirm('Tem certeza que deseja excluir esta tarefa?')) {
                  handleDeleteTask(editingTask.id);
                  closeModals();
                }
              }}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20"
            >
              <Trash className="w-4 h-4 mr-2" />
              Excluir Tarefa
            </Button>
            
            <div className="flex space-x-3">
              <Button
                type="button"
                variant="outline"
                onClick={closeModals}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
              >
                Atualizar Tarefa
              </Button>
            </div>
          </div>
        </form>
      </Modal>
      </div>
    </DndContext>
  );
};
