import React, { useState, useMemo } from 'react';
import { useTasks } from '../contexts/TaskContext';
import { useAuth } from '../contexts/AuthContext';
import { Task, CreateTaskData } from '../contexts/TaskContext';
import { Button, Input, Textarea, Select, Modal, Badge } from '../components/ui';
import { TaskItem } from '../components/TaskItem';
import { QuickTaskCreator } from '../components/QuickTaskCreator';
import { DatePickerPopover } from '../components/DatePickerPopover';
import { DateInputBR } from '../components/DateInputBR';
import { Trash, Plus } from 'phosphor-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useDroppable,
} from '@dnd-kit/core';


export function Tasks() {
  const { tasks, isLoading, error, createTask, updateTask, deleteTask, toggleTaskCompletion } = useTasks();
  const { user } = useAuth();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const [datePickerTask, setDatePickerTask] = useState<Task | null>(null);
  const [datePickerPosition, setDatePickerPosition] = useState<{ top: number; left: number } | null>(null);
  
  const [formData, setFormData] = useState<CreateTaskData>({
    title: '',
    description: '',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
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
      setFormData({ title: '', description: '', priority: 'medium', category: '', dueDate: '' });
      setShowCreateModal(false);
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
    if (window.confirm('Tem certeza que deseja excluir esta tarefa?')) {
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

  const handleSetDate = async (taskId: string, date: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const updateData = {
      title: task.title,
      description: task.description,
      priority: task.priority,
      category: task.category,
      completed: task.completed,
      dueDate: date,
    };

    try {
      await updateTask(taskId, updateData, false);
      setDatePickerTask(null); // Fechar o date picker após salvar
    } catch (error) {
      console.error('Erro ao definir data:', error);
    }
  };

  const handleOpenDatePicker = (task: Task, triggerElement?: HTMLElement) => {
    setDatePickerTask(task);
    
    if (triggerElement) {
      const rect = triggerElement.getBoundingClientRect();
      setDatePickerPosition({
        top: rect.top - 10, // 10px acima do botão
        left: rect.left + rect.width / 2, // centralizado horizontalmente
      });
    } else {
      // Fallback para o centro da tela
      setDatePickerPosition(null);
    }
  };

  const handleQuickCreate = async (title: string, sectionId: string) => {
    // Determinar a data baseada na seção
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + 30);

    let dueDate = '';
    switch (sectionId) {
      case 'hoje':
        dueDate = today.getFullYear() + '-' + 
          String(today.getMonth() + 1).padStart(2, '0') + '-' + 
          String(today.getDate()).padStart(2, '0');
        break;
      case 'amanha':
        dueDate = tomorrow.getFullYear() + '-' + 
          String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' + 
          String(tomorrow.getDate()).padStart(2, '0');
        break;
      case 'proxima-semana':
        dueDate = nextWeek.getFullYear() + '-' + 
          String(nextWeek.getMonth() + 1).padStart(2, '0') + '-' + 
          String(nextWeek.getDate()).padStart(2, '0');
        break;
      case 'eventos-futuros':
        dueDate = futureDate.getFullYear() + '-' + 
          String(futureDate.getMonth() + 1).padStart(2, '0') + '-' + 
          String(futureDate.getDate()).padStart(2, '0');
        break;
      case 'algum-dia':
        dueDate = ''; // Sem data
        break;
      default:
        dueDate = '';
    }

    try {
      // Criar a tarefa imediatamente
      const newTask = await createTask({
        title: title,
        description: '',
        priority: 'medium',
        category: '',
        dueDate: dueDate,
      });

      // Abrir o modal de edição com a tarefa recém-criada
      setEditingTask(newTask);
      setFormData({
        title: newTask.title,
        description: newTask.description || '',
        priority: newTask.priority,
        category: newTask.category || '',
        dueDate: newTask.due_date || '',
      });
    } catch (error) {
      console.error('Erro ao criar tarefa:', error);
    }
  };

  // Função para lidar com drag and drop
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const activeTask = active.data.current?.task;
    const overSection = over.data.current?.section;

    if (!activeTask || !overSection) {
      return;
    }

    // Determinar nova data baseada na seção
    let newDueDate: string | null = null;
    
    // Usar data local para evitar problemas de fuso horário
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + 
      String(today.getMonth() + 1).padStart(2, '0') + '-' + 
      String(today.getDate()).padStart(2, '0');
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.getFullYear() + '-' + 
      String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' + 
      String(tomorrow.getDate()).padStart(2, '0');
    
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const nextWeekStr = nextWeek.getFullYear() + '-' + 
      String(nextWeek.getMonth() + 1).padStart(2, '0') + '-' + 
      String(nextWeek.getDate()).padStart(2, '0');
    
    switch (overSection) {
      case 'hoje':
        newDueDate = todayStr;
        break;
      case 'amanha':
        newDueDate = tomorrowStr;
        break;
      case 'proxima-semana':
        newDueDate = nextWeekStr;
        break;
      case 'eventos-futuros':
        // Para eventos futuros, vamos usar uma data 30 dias no futuro
        const futureDate = new Date(today);
        futureDate.setDate(futureDate.getDate() + 30);
        newDueDate = futureDate.getFullYear() + '-' + 
          String(futureDate.getMonth() + 1).padStart(2, '0') + '-' + 
          String(futureDate.getDate()).padStart(2, '0');
        break;
      case 'algum-dia':
        newDueDate = null;
        break;
      default:
        return;
    }

    const updateData = {
      title: activeTask.title,
      description: activeTask.description,
      priority: activeTask.priority,
      category: activeTask.category,
      completed: activeTask.completed,
      dueDate: newDueDate === null ? undefined : newDueDate, // Use undefined for null
    };
    
    try {
      await updateTask(activeTask.id, updateData, false);
    } catch (error) {
      console.error('Erro ao atualizar tarefa:', error);
    }
  };

  // Função para categorizar tarefas por período
  const categorizedTasks = useMemo(() => {
    // Usar data local sem problemas de fuso horário
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    

    const categories = {
      vencidas: [] as Task[],
      hoje: [] as Task[],
      amanha: [] as Task[],
      proximaSemana: [] as Task[],
      eventosFuturos: [] as Task[],
      algumDia: [] as Task[],
    };

    tasks.forEach(task => {
      if (!task.due_date) {
        categories.algumDia.push(task);
        return;
      }

      // Parse da data da tarefa de forma segura
      const taskDateStr = task.due_date.split('T')[0]; // Remove timezone info
      const [year, month, day] = taskDateStr.split('-').map(Number);
      const taskDateOnly = new Date(year, month - 1, day); // month é 0-indexed
      
      const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const tomorrowOnly = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
      const nextWeekOnly = new Date(nextWeek.getFullYear(), nextWeek.getMonth(), nextWeek.getDate());

      if (taskDateOnly < todayOnly) {
        categories.vencidas.push(task);
      } else if (taskDateOnly.getTime() === todayOnly.getTime()) {
        categories.hoje.push(task);
      } else if (taskDateOnly.getTime() === tomorrowOnly.getTime()) {
        categories.amanha.push(task);
      } else if (taskDateOnly <= nextWeekOnly) {
        categories.proximaSemana.push(task);
      } else {
        // Tarefas com data posterior à próxima semana vão para "Eventos Futuros"
        categories.eventosFuturos.push(task);
      }
    });

    // Ordenar tarefas dentro de cada categoria
    Object.keys(categories).forEach(key => {
      const categoryKey = key as keyof typeof categories;
      
      if (categoryKey === 'proximaSemana' || categoryKey === 'eventosFuturos') {
        // Para seções baseadas em tempo: ordenar por data (mais próximas primeiro)
        categories[categoryKey].sort((a, b) => {
          if (!a.due_date || !b.due_date) return 0;
          
          const dateA = new Date(a.due_date.split('T')[0]);
          const dateB = new Date(b.due_date.split('T')[0]);
          
          return dateA.getTime() - dateB.getTime();
        });
      } else {
        // Para outras seções: ordenar por data de criação (mais recentes por último)
        categories[categoryKey].sort((a, b) => {
          // Ordenar por created_at se disponível, senão por id (que geralmente é sequencial)
          if (a.created_at && b.created_at) {
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          }
          // Fallback para ordenação por ID (assumindo que IDs são sequenciais)
          return a.id.localeCompare(b.id);
        });
      }
    });

    return categories;
  }, [tasks]);

  // Componente para seção droppable
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
      <div 
        className="mb-1"
        onMouseEnter={() => setHoveredSection(sectionId)}
        onMouseLeave={() => setHoveredSection(null)}
      >
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center">
          {title}
          <Badge variant="default" className="ml-2">
            {tasks.length}
          </Badge>
        </h2>
        <div 
          ref={setNodeRef}
          className={`space-y-1 transition-all duration-500 ease-out ${
            tasks.length > 0 
              ? `min-h-[50px] p-1 ${
                  isOver 
                    ? 'bg-blue-50/50 dark:bg-blue-900/10 rounded-lg' 
                    : ''
                }`
              : `${
                  isOver 
                    ? 'min-h-[60px] p-3 bg-blue-50/50 dark:bg-blue-900/10 rounded-lg border-2 border-dashed border-blue-300/50 dark:border-blue-600/50' 
                    : 'h-0 p-0 hover:h-auto hover:min-h-[4px] hover:bg-gray-50/10 dark:hover:bg-gray-800/10'
                }`
          }`}
        >
          {tasks.length > 0 ? (
            <SortableContext items={tasks.map(task => task.id)} strategy={verticalListSortingStrategy}>
              {tasks.map((task) => (
                <TaskItem 
                  key={task.id} 
                  task={task} 
                  section={sectionId}
                  onToggleCompletion={toggleTaskCompletion}
                  onEdit={openEditModal}
                  onUpdateTask={updateTask}
                  onSetDate={handleSetDate}
                  onOpenDatePicker={(task, element) => handleOpenDatePicker(task, element)}
                />
              ))}
            </SortableContext>
          ) : (
            <div className={`flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm transition-all duration-500 ease-out overflow-hidden ${
              isOver 
                ? 'h-[54px] opacity-100' 
                : 'h-0 opacity-0'
            }`}>
              {isOver ? "✨ Solte aqui para mover" : emptyMessage}
            </div>
          )}
        </div>
        
        {/* Quick Task Creator - só renderiza quando necessário */}
        {(hoveredSection === sectionId || tasks.length > 0) && (
          <div className={tasks.length > 0 ? "min-h-[40px]" : ""}>
            <QuickTaskCreator
              sectionId={sectionId}
              onQuickCreate={handleQuickCreate}
              isVisible={hoveredSection === sectionId}
              hasTasks={tasks.length > 0}
            />
          </div>
        )}
      </div>
    );
  };

  const priorityOptions = [
    { value: 'low', label: 'Baixa' },
    { value: 'medium', label: 'Média' },
    { value: 'high', label: 'Alta' },
    { value: 'urgent', label: 'Urgente' },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Carregando tarefas...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500">Erro: {error}</div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              Tarefas
            </h1>
            <Button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center space-x-2"
            >
              <Plus className="w-5 h-5" />
              <span>Nova Tarefa</span>
            </Button>
          </div>

          <div className="space-y-6">
            <DroppableSection
              title="Vencidas"
              tasks={categorizedTasks.vencidas}
              emptyMessage="Nenhuma tarefa vencida"
              sectionId="vencidas"
            />

            <DroppableSection
              title="Hoje"
              tasks={categorizedTasks.hoje}
              emptyMessage="Nenhuma tarefa para hoje"
              sectionId="hoje"
            />

            <DroppableSection
              title="Amanhã"
              tasks={categorizedTasks.amanha}
              emptyMessage="Nenhuma tarefa para amanhã"
              sectionId="amanha"
            />

            <DroppableSection
              title="Próxima Semana"
              tasks={categorizedTasks.proximaSemana}
              emptyMessage="Nenhuma tarefa para próxima semana"
              sectionId="proxima-semana"
            />

            <DroppableSection
              title="Eventos Futuros"
              tasks={categorizedTasks.eventosFuturos}
              emptyMessage="Nenhum evento futuro"
              sectionId="eventos-futuros"
            />

            <DroppableSection
              title="Algum Dia"
              tasks={categorizedTasks.algumDia}
              emptyMessage="Nenhuma tarefa para algum dia"
              sectionId="algum-dia"
            />
          </div>
        </div>

        {/* Modal de Criação */}
        <Modal
          isOpen={showCreateModal}
          onClose={closeModals}
          title="Nova Tarefa"
        >
          <form onSubmit={handleCreateTask} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Título
              </label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Digite o título da tarefa"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Descrição
              </label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Digite a descrição da tarefa"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Prioridade
                </label>
                <Select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as 'low' | 'medium' | 'high' | 'urgent' })}
                  options={priorityOptions}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Categoria
                </label>
                <Input
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="Ex: Trabalho, Pessoal"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Data de Vencimento
              </label>
              <DateInputBR
                value={formData.dueDate}
                onChange={(date) => setFormData({ ...formData, dueDate: date })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div className="flex justify-end space-x-3">
              <Button
                type="button"
                variant="outline"
                onClick={closeModals}
              >
                Cancelar
              </Button>
              <Button type="submit">
                Criar Tarefa
              </Button>
            </div>
          </form>
        </Modal>

        {/* Modal de Edição */}
        <Modal
          isOpen={!!editingTask}
          onClose={closeModals}
          title="Editar Tarefa"
        >
          <form onSubmit={handleUpdateTask} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Título
              </label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Digite o título da tarefa"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Descrição
              </label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Digite a descrição da tarefa"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Prioridade
                </label>
                <Select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as 'low' | 'medium' | 'high' | 'urgent' })}
                  options={priorityOptions}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Categoria
                </label>
                <Input
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="Ex: Trabalho, Pessoal"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Data de Vencimento
              </label>
              <DateInputBR
                value={formData.dueDate}
                onChange={(date) => setFormData({ ...formData, dueDate: date })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div className="flex justify-between">
              <Button
                type="button"
                variant="danger"
                onClick={() => editingTask && handleDeleteTask(editingTask.id)}
                className="flex items-center space-x-2"
              >
                <Trash className="w-4 h-4" />
                <span>Excluir</span>
              </Button>

              <div className="flex space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeModals}
                >
                  Cancelar
                </Button>
                <Button type="submit">
                  Salvar Alterações
                </Button>
              </div>
            </div>
          </form>
        </Modal>
        
        {/* Date Picker Popover - Global */}
        <DatePickerPopover
          isOpen={!!datePickerTask}
          onClose={() => {
            setDatePickerTask(null);
            setDatePickerPosition(null);
          }}
          onDateSelect={(date) => {
            if (datePickerTask) {
              handleSetDate(datePickerTask.id, date);
            }
          }}
          position={datePickerPosition}
          initialDate={datePickerTask?.due_date || ''}
        />
      </div>
    </DndContext>
  );
}