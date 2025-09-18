import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTasks } from '../contexts/TaskContext';
import { Task, CreateTaskData } from '../contexts/TaskContext';
import { Button, Input, Textarea, Select, Modal, Badge, toast } from '../components/ui';
import { TaskItem } from '../components/TaskItem';
import { QuickTaskCreator } from '../components/QuickTaskCreator';
import { DateTimePickerPopover } from '../components/DateTimePickerPopover';
import { CategoryPickerPopover } from '../components/CategoryPickerPopover';
import { useCategories } from '../hooks/useCategories';
import { Trash, Fire } from 'phosphor-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import {
  useDroppable,
} from '@dnd-kit/core';


export function Tasks() {
  const { tasks, isLoading, error, createTask, updateTask, deleteTask, undoDeleteTask, toggleTaskCompletion, reorderTasks } = useTasks();
  const { categories, addCategory } = useCategories();
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const [datePickerTask, setDatePickerTask] = useState<Task | null>(null);
  const [datePickerPosition, setDatePickerPosition] = useState<{ top: number; left: number } | null>(null);
  const [categoryPickerTask, setCategoryPickerTask] = useState<Task | null>(null);
  const [categoryPickerPosition, setCategoryPickerPosition] = useState<{ top: number; left: number } | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [insertionIndicator, setInsertionIndicator] = useState<{ sectionId: string; index: number } | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  
  // Ref para o campo de título
  const titleInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState<CreateTaskData>({
    title: '',
    description: '',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
    category: '', // Sem categoria padrão
    important: false,
    time: '',
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
    console.log('Creating task with data:', formData);
    try {
      await createTask(formData);
      setFormData({ title: '', description: '', priority: 'medium', category: '', important: false, time: '', dueDate: '' });
      setShowCreateModal(false);
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  };

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;
    
    console.log('handleUpdateTask called:', { taskId: editingTask.id, formData });
    
    try {
      await updateTask(editingTask.id, formData);
      setEditingTask(null);
      setFormData({ title: '', description: '', priority: 'medium', category: '', important: false, time: '', dueDate: '' });
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

  // Focar automaticamente no campo de título quando o modal de criação abrir
  useEffect(() => {
    if (showCreateModal && titleInputRef.current) {
      // Pequeno delay para garantir que o modal foi renderizado
      setTimeout(() => {
        titleInputRef.current?.focus();
      }, 100);
    }
  }, [showCreateModal]);

  // Atalhos de teclado
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Verificar se não estamos em um input, textarea ou modal
      const target = event.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true';
      const isModalOpen = showCreateModal || editingTask;
      
      // Se pressionar "/" e não estiver em input/modal, abrir modal de nova tarefa
      if (event.key === '/' && !isInput && !isModalOpen) {
        event.preventDefault();
        setShowCreateModal(true);
      }
      
      // Se pressionar Command+Enter (Mac) ou Ctrl+Enter (Windows) no modal de criação
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && showCreateModal) {
        event.preventDefault();
        // Simular submit do form
        const form = document.querySelector('form');
        if (form) {
          form.requestSubmit();
        }
      }
      
      // Prevenir Enter sozinho de submeter o form no modal de criação
      if (event.key === 'Enter' && showCreateModal && !event.metaKey && !event.ctrlKey) {
        // Verificar se não estamos em um textarea
        const target = event.target as HTMLElement;
        if (target.tagName !== 'TEXTAREA') {
          event.preventDefault();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showCreateModal, editingTask]);

  const handleDeleteTask = async (taskId: string) => {
    try {
      const deletedTask = await deleteTask(taskId);
      // Fechar modal de edição se a tarefa excluída estava sendo editada
      if (editingTask && editingTask.id === taskId) {
        closeModals();
      }
      
      // Show toast with undo option
      if (deletedTask) {
        toast.success('Tarefa deletada', {
          description: `"${deletedTask.title}" foi removida`,
          action: {
            label: 'Desfazer',
            onClick: async () => {
              console.log('Undo clicked for task:', deletedTask.id);
              try {
                const success = await undoDeleteTask(deletedTask.id);
                if (success) {
                  toast.success('Tarefa restaurada', {
                    description: `"${deletedTask.title}" foi restaurada com sucesso`,
                  });
                } else {
                  toast.error('Erro ao restaurar tarefa', {
                    description: 'A tarefa não pôde ser encontrada para restauração',
                  });
                }
              } catch (error) {
                console.error('Failed to restore task:', error);
                toast.error('Erro ao restaurar tarefa', {
                  description: 'Não foi possível restaurar a tarefa',
                });
              }
            },
          },
        });
      }
    } catch (error) {
      console.error('Failed to delete task:', error);
      toast.error('Erro ao deletar tarefa', {
        description: 'Não foi possível remover a tarefa',
      });
    }
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      category: task.category || '',
      important: task.important || false,
      time: task.time || '',
      dueDate: task.due_date ? (task.due_date.includes('T') ? task.due_date.split('T')[0] : task.due_date) : '',
    });
  };

  const closeModals = () => {
    setShowCreateModal(false);
    setEditingTask(null);
    setFormData({ title: '', description: '', priority: 'medium', category: '', important: false, time: '', dueDate: '' });
  };

  const handleSetDate = async (taskId: string, date: string, time?: string) => {
    console.log('handleSetDate called:', { taskId, date, time, editingTask: editingTask?.id });
    
    // Se é uma task sendo editada no modal ou uma task temporária de criação, atualizar apenas o formData
    if ((editingTask && taskId === editingTask.id) || taskId === 'temp-create') {
      console.log('Updating formData for editing/creating task');
      setFormData(prev => ({
        ...prev,
        dueDate: date,
        time: time || '',
      }));
      setDatePickerTask(null);
      return;
    }

    // Caso contrário, atualizar a task diretamente
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const updateData = {
      title: task.title,
      description: task.description,
      priority: task.priority,
      category: task.category,
      important: task.important,
      completed: task.completed,
      time: time || task.time,
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

  const handleOpenCategoryPicker = (task: Task, triggerElement?: HTMLElement) => {
    setCategoryPickerTask(task);
    
    if (triggerElement) {
      const rect = triggerElement.getBoundingClientRect();
      setCategoryPickerPosition({
        top: rect.top - 10, // 10px acima do botão
        left: rect.left + rect.width / 2, // centralizado horizontalmente
      });
    } else {
      // Fallback para o centro da tela
      setCategoryPickerPosition(null);
    }
  };

  const handleSetCategory = async (taskId: string, category: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const updateData = {
      title: task.title,
      description: task.description,
      priority: task.priority,
      category: category,
      important: task.important,
      completed: task.completed,
      dueDate: task.due_date,
    };

    try {
      await updateTask(taskId, updateData, false);
      setCategoryPickerTask(null); // Fechar o category picker após salvar
    } catch (error) {
      console.error('Erro ao definir categoria:', error);
    }
  };

  const handleQuickCreate = async (title: string, sectionId: string) => {
    // Determinar a data baseada na seção
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
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
        category: '', // Sem categoria padrão
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

  // Função para lidar com início do drag
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = tasks.find(t => t.id === active.id);
    setActiveTask(task || null);
  };

  // Função para lidar com drag over (mostrar linha de inserção)
  const handleDragOver = (event: DragOverEvent) => {
    try {
      const { active, over } = event;
      
      if (!over || !active.data.current?.task) {
        setInsertionIndicator(null);
        return;
      }

    const overTask = over.data.current?.task;
    const overSection = over.data.current?.section;
    
    if (overTask && overSection) {
      // Estamos sobre uma task específica
      // Mostrar linha de inserção para:
      // 1. Reordenação dentro da mesma seção (exceto seções temporais)
      // 2. Mudança para outra seção (exceto seções temporais)
      if (!['eventos-futuros'].includes(overSection)) {
        const sectionTasks = categorizedTasks[overSection as keyof typeof categorizedTasks];
        const overIndex = sectionTasks.findIndex(task => task.id === overTask.id);
        
        setInsertionIndicator({
          sectionId: overSection,
          index: overIndex,
        });
      } else {
        setInsertionIndicator(null);
      }
    } else if (overSection && !['eventos-futuros'].includes(overSection)) {
      // Estamos sobre uma seção vazia (que permite inserção manual)
      setInsertionIndicator({
        sectionId: overSection,
        index: 0,
      });
    } else {
      setInsertionIndicator(null);
    }
    } catch (error) {
      console.error('Erro no drag over:', error);
      setInsertionIndicator(null);
    }
  };

  // Função para lidar com drag and drop
  const handleDragEnd = async (event: DragEndEvent) => {
    try {
      setActiveTask(null); // Limpar o activeTask
      setInsertionIndicator(null); // Limpar a linha de inserção
      const { active, over } = event;

      if (!over || active.id === over.id) {
        return;
      }

    const activeTask = active.data.current?.task;
    const overSection = over.data.current?.section;
    const overTask = over.data.current?.task;

    if (!activeTask) {
      return;
    }

    // Se estamos reordenando dentro da mesma seção
    if (overTask && activeTask.id !== overTask.id) {
      const currentSection = active.data.current?.section;
      
      
      // Permitir reordenação apenas em seções que não são baseadas em tempo
      if (currentSection === overSection && 
          !['eventos-futuros'].includes(currentSection)) {
        
        
        // Encontrar as tarefas da seção atual
        const sectionTasks = categorizedTasks[currentSection as keyof typeof categorizedTasks];
        const oldIndex = sectionTasks.findIndex(task => task.id === activeTask.id);
        const newIndex = sectionTasks.findIndex(task => task.id === overTask.id);
        
        
        if (oldIndex !== -1 && newIndex !== -1) {
          
          // Encontrar os índices no array principal de tarefas
          const allTasks = [...tasks];
          const activeTaskIndex = allTasks.findIndex(t => t.id === activeTask.id);
          const overTaskIndex = allTasks.findIndex(t => t.id === overTask.id);
          
          
          if (activeTaskIndex !== -1 && overTaskIndex !== -1) {
            
            // Reordenar diretamente usando a função do contexto
            const reorderedTasks = arrayMove(allTasks, activeTaskIndex, overTaskIndex);
            reorderTasks(reorderedTasks);
            
          }
        }
        
        return; // Não continuar com a lógica de mudança de seção
      }
    }

    // Lógica existente para mudança de seção
    if (!overSection) {
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
    
    
    switch (overSection) {
      case 'hoje':
        newDueDate = todayStr;
        break;
      case 'amanha':
        newDueDate = tomorrowStr;
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
    } catch (error) {
      console.error('Erro no drag and drop:', error);
      // Resetar estados em caso de erro
      setActiveTask(null);
      setInsertionIndicator(null);
    }
  };

  // Função para categorizar tarefas por período
  const categorizedTasks = useMemo(() => {
    // Usar data local do usuário, não UTC do servidor
    const now = new Date();
    
    // Criar datas usando o fuso horário local do usuário
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zerar horário para comparação apenas de data
    
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    // Converter para strings no formato YYYY-MM-DD usando fuso local
    const todayStr = today.getFullYear() + '-' + 
      String(today.getMonth() + 1).padStart(2, '0') + '-' + 
      String(today.getDate()).padStart(2, '0');
      
    const tomorrowStr = tomorrow.getFullYear() + '-' + 
      String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' + 
      String(tomorrow.getDate()).padStart(2, '0');
      
    // Debug: verificar as datas corrigidas
    console.log('Debug - Datas corrigidas:', {
      todayStr,
      tomorrowStr,
      userLocalDate: now.toLocaleDateString('pt-BR'),
      userLocalTime: now.toLocaleTimeString('pt-BR'),
      userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      utcDate: now.toISOString().split('T')[0]
    });
    
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    

    const categories = {
      vencidas: [] as Task[],
      hoje: [] as Task[],
      amanha: [] as Task[],
      eventosFuturos: [] as Task[],
      algumDia: [] as Task[],
    };

    tasks.forEach(task => {
      if (!task.due_date) {
        categories.algumDia.push(task);
        return;
      }

      // Extrair apenas a parte da data (YYYY-MM-DD) ignorando horário e fuso
      const taskDateStr = task.due_date.split('T')[0];
      
      // Debug: log da comparação de datas
      console.log(`Task "${task.title}": taskDateStr="${taskDateStr}", todayStr="${todayStr}", tomorrowStr="${tomorrowStr}"`);
      
      // Comparar diretamente as strings de data
      if (taskDateStr < todayStr) {
        categories.vencidas.push(task);
        console.log(`  → Categorizada como VENCIDA`);
      } else if (taskDateStr === todayStr) {
        categories.hoje.push(task);
        console.log(`  → Categorizada como HOJE`);
      } else if (taskDateStr === tomorrowStr) {
        categories.amanha.push(task);
        console.log(`  → Categorizada como AMANHÃ`);
      } else {
        // Tarefas com data futura vão para "Eventos Futuros"
        categories.eventosFuturos.push(task);
        console.log(`  → Categorizada como EVENTOS FUTUROS`);
      }
    });

    // Ordenar tarefas dentro de cada categoria
    Object.keys(categories).forEach(key => {
      const categoryKey = key as keyof typeof categories;
      
      if (categoryKey === 'eventosFuturos') {
        // Para seções baseadas em tempo: ordenar por data (mais próximas primeiro)
        categories[categoryKey].sort((a, b) => {
          if (!a.due_date || !b.due_date) return 0;
          
          // Extrair apenas a parte da data (YYYY-MM-DD) para evitar problemas de timezone
          const dateAStr = a.due_date.includes('T') ? a.due_date.split('T')[0] : a.due_date;
          const dateBStr = b.due_date.includes('T') ? b.due_date.split('T')[0] : b.due_date;
          
          const [yearA, monthA, dayA] = dateAStr.split('-').map(Number);
          const [yearB, monthB, dayB] = dateBStr.split('-').map(Number);
          
          const dateA = new Date(yearA, monthA - 1, dayA);
          const dateB = new Date(yearB, monthB - 1, dayB);
          
          return dateA.getTime() - dateB.getTime();
        });
      } else {
        // Para outras seções: manter ordem manual (não forçar ordenação automática)
        // Usuário pode reordenar manualmente via drag and drop
        // Apenas ordenação inicial por data de criação, mas preserva reordenações manuais
        // Para outras seções: manter ordem do array principal (permite reordenação manual)
        // Não aplicar ordenação automática para preservar reordenações manuais
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
      <div className="mb-1">
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
                    ? 'bg-blue-50/20 dark:bg-blue-900/5 rounded-lg' 
                    : ''
                }`
              : `${
                  isOver 
                    ? 'min-h-[60px] p-3 bg-blue-50/30 dark:bg-blue-900/5 rounded-lg border border-dashed border-blue-300/30 dark:border-blue-600/30' 
                    : 'h-0 p-0 hover:h-auto hover:min-h-[4px] hover:bg-gray-50/10 dark:hover:bg-gray-800/10'
                }`
          }`}
        >
          {tasks.length > 0 ? (
            <SortableContext items={tasks.map(task => task.id)} strategy={verticalListSortingStrategy}>
              {tasks.map((task, index) => (
                <TaskItem 
                  key={task.id} 
                  task={task} 
                  section={sectionId}
                  onToggleCompletion={toggleTaskCompletion}
                  onEdit={openEditModal}
                  onDelete={handleDeleteTask}
                  onUpdateTask={updateTask}
                  onOpenDatePicker={(task, element) => handleOpenDatePicker(task, element)}
                  onOpenCategoryPicker={(task, element) => handleOpenCategoryPicker(task, element)}
                  showInsertionLine={
                    insertionIndicator?.sectionId === sectionId &&
                    insertionIndicator?.index === index
                  }
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
          <div 
            className={tasks.length > 0 ? "min-h-[40px]" : ""}
            onMouseEnter={() => setHoveredSection(sectionId)}
            onMouseLeave={() => setHoveredSection(null)}
          >
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


  const categoryOptions = [
    { value: '', label: '— Sem categoria —' },
    ...categories.map(cat => ({
      value: cat.name,
      label: cat.name,
    }))
  ];

  const handleAddCategory = () => {
    if (newCategoryName.trim()) {
      addCategory(newCategoryName.trim());
      setNewCategoryName('');
    }
  };


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
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
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
              className="flex items-center space-x-2 font-normal"
        >
              <span>Nova Tarefa</span>
              <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">/</span>
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
            ref={titleInputRef}
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

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Categoria
              </label>
              <div className="space-y-2">
            <Select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  options={categoryOptions}
                />
                
                {/* Adicionar nova categoria */}
                <div className="flex space-x-2">
            <Input
                      placeholder="Nova categoria..."
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      className="flex-1"
                    />
                  <Button
                    type="button"
                    onClick={handleAddCategory}
                    disabled={!newCategoryName.trim()}
                    className="px-3"
                  >
                    <span className="text-lg">+</span>
                  </Button>
                </div>
              </div>
            </div>

            <div>
              <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <input
                  type="checkbox"
                  checked={formData.important || false}
                  onChange={(e) => setFormData({ ...formData, important: e.target.checked })}
                  className="w-4 h-4 text-red-600 bg-gray-100 border-gray-300 rounded focus:ring-red-500 dark:focus:ring-red-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
                <Fire className="w-4 h-4 text-red-500" weight="fill" />
                <span>Marcar como importante</span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Data e Horário
              </label>
              <button
                type="button"
                onClick={(e) => {
                  // Criar uma task temporária para o modal de criação
                  const tempTask = {
                    id: 'temp-create',
                    user_id: '',
                    title: formData.title,
                    description: formData.description,
                    completed: false,
                    priority: formData.priority,
                    category: formData.category,
                    important: formData.important,
                    due_date: formData.dueDate,
                    time: formData.time,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  } as Task;
                  
                  handleOpenDatePicker(tempTask, e.currentTarget as HTMLElement);
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-left hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                {formData.dueDate ? (
                  <span>
                    {(() => {
                      try {
                        const date = new Date(formData.dueDate + 'T00:00:00');
                        const dateStr = date.toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: 'short',
                          year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
                        });
                        return formData.time ? `${dateStr} às ${formData.time}` : dateStr;
                      } catch {
                        return 'Data inválida';
                      }
                    })()}
                  </span>
                ) : (
                  <span className="text-gray-400 dark:text-gray-500">Clique para definir data e horário</span>
                )}
              </button>
            </div>

            <div className="flex justify-end space-x-3">
            <Button
              type="button"
              variant="outline"
              onClick={closeModals}
            >
              Cancelar
            </Button>
              <Button type="submit" className="flex items-center space-x-2">
              <span>Criar</span>
              <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">⌘↵</span>
            </Button>
          </div>
        </form>
      </Modal>

        {/* Modal de Edição */}
      <Modal
        isOpen={!!editingTask}
        onClose={closeModals}
        title="Editar Tarefa"
        className="!max-w-[680px]"
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

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Categoria
              </label>
              <div className="space-y-2">
            <Select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  options={categoryOptions}
                />
                
                {/* Adicionar nova categoria */}
                <div className="flex space-x-2">
            <Input
                      placeholder="Nova categoria..."
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      className="flex-1"
                    />
                  <Button
                    type="button"
                    onClick={handleAddCategory}
                    disabled={!newCategoryName.trim()}
                    className="px-3"
                  >
                    <span className="text-lg">+</span>
                  </Button>
                </div>
              </div>
            </div>

            <div>
              <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <input
                  type="checkbox"
                  checked={formData.important || false}
                  onChange={(e) => setFormData({ ...formData, important: e.target.checked })}
                  className="w-4 h-4 text-red-600 bg-gray-100 border-gray-300 rounded focus:ring-red-500 dark:focus:ring-red-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
                <Fire className="w-4 h-4 text-red-500" weight="fill" />
                <span>Marcar como importante</span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Data e Horário
              </label>
              <button
                type="button"
                onClick={(e) => {
                  // Criar uma task temporária para o modal
                  const tempTask = {
                    ...editingTask,
                    due_date: formData.dueDate,
                    time: formData.time,
                  } as Task;
                  
                  handleOpenDatePicker(tempTask, e.currentTarget as HTMLElement);
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-left hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                {formData.dueDate ? (
                  <span>
                    {(() => {
                      try {
                        const date = new Date(formData.dueDate + 'T00:00:00');
                        const dateStr = date.toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: 'short',
                          year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
                        });
                        return formData.time ? `${dateStr} às ${formData.time}` : dateStr;
                      } catch {
                        return 'Data inválida';
                      }
                    })()}
                  </span>
                ) : (
                  <span className="text-gray-400 dark:text-gray-500">Clique para definir data e horário</span>
                )}
              </button>
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
        
        {/* Date Time Picker Popover - Global */}
        <DateTimePickerPopover
          isOpen={!!datePickerTask}
          onClose={() => {
            setDatePickerTask(null);
            setDatePickerPosition(null);
          }}
          onDateTimeSelect={(date, time) => {
            if (datePickerTask) {
              handleSetDate(datePickerTask.id, date, time);
            }
          }}
          position={datePickerPosition}
          initialDate={datePickerTask?.due_date || ''}
          initialTime={datePickerTask?.time || ''}
        />
        
        {/* Category Picker Popover - Global */}
        <CategoryPickerPopover
          isOpen={!!categoryPickerTask}
          onClose={() => {
            setCategoryPickerTask(null);
            setCategoryPickerPosition(null);
          }}
          onCategorySelect={(category) => {
            if (categoryPickerTask) {
              handleSetCategory(categoryPickerTask.id, category);
            }
          }}
          position={categoryPickerPosition}
          initialCategory={categoryPickerTask?.category || ''}
        />
      </div>
      
      {/* Drag Overlay - Mostra a task sendo arrastada */}
      <DragOverlay
        dropAnimation={{
          duration: 150,
          easing: 'ease-out',
        }}
      >
        {activeTask ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl border-2 border-blue-300 dark:border-blue-600 py-2 px-3 transform-gpu" style={{ zIndex: 9999 }}>
            <div className="flex items-center space-x-3">
              {/* Círculo de Conclusão */}
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                activeTask.completed
                  ? 'bg-green-500 border-green-500'
                  : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
              }`}>
                {activeTask.completed && (
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              
              {/* Ícone de Importante */}
              {activeTask.important && (
                <Fire 
                  className="w-4 h-4 text-red-500 flex-shrink-0 ml-2" 
                  weight="fill"
                />
              )}
              
              {/* Título */}
              <span className={`font-normal ${
                activeTask.completed 
                  ? 'line-through text-gray-500 dark:text-gray-400' 
                  : 'text-gray-900 dark:text-gray-100'
              }`}>
                {activeTask.title}
              </span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}