/**
 * Tasks Page
 * 
 * Main tasks page with categorized sections and drag-and-drop support
 */

import { useState, useMemo, useCallback, memo, useEffect, useRef } from 'react';
import { Gear } from '@phosphor-icons/react';
import { useTasks, Task } from '../../contexts/TaskContext';
import { useLists } from '../../contexts/ListContext';
import { TaskItem, TaskDetailsSidebar } from '../../components/features/tasks';
import { MainLayout } from '../../components/layout';
import { TasksSidebar, ListType } from '../../components/features/tasks';
import { Button, TaskCreationData, Collapsible } from '../../components/ui';
import { toast } from '../../components/ui/Sonner';
import { CreateListPopover } from '../../components/features/tasks/CreateListPopover/CreateListPopover';
import { useMergedTaskCategories } from '../../hooks/useMergedTaskCategories';
import { motion, AnimatePresence } from 'motion/react';
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
import { useDroppable } from '@dnd-kit/core';
import styles from './Tasks.module.css';

/**
 * Calcula os limites da próxima semana do calendário.
 * "Semana que vem" = próxima segunda-feira até o domingo seguinte (inclusive).
 * Retorna strings no formato YYYY-MM-DD para comparação.
 */
function getNextWeekBounds(today: Date): { start: string; end: string } {
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  
  // Calcular dias até a próxima segunda-feira
  // Se hoje é domingo (0), próxima segunda é em 1 dia
  // Se hoje é segunda (1), próxima segunda é em 7 dias
  // Se hoje é terça (2), próxima segunda é em 6 dias
  // etc.
  const daysUntilNextMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
  
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + daysUntilNextMonday);
  
  // O fim da semana é o domingo seguinte (6 dias depois da segunda)
  // Usamos segunda-feira seguinte para comparação exclusiva (< endStr)
  const mondayAfterNextWeek = new Date(nextMonday);
  mondayAfterNextWeek.setDate(nextMonday.getDate() + 7);
  
  return {
    start: nextMonday.toISOString().split('T')[0],
    end: mondayAfterNextWeek.toISOString().split('T')[0],
  };
}

export function Tasks() {
  const [selectedList, setSelectedList] = useState<ListType>('all');
  const [selectedCustomListId, setSelectedCustomListId] = useState<string | null>(null);
  const [selectedCategoryName, setSelectedCategoryName] = useState<string | null>(null);
  const [isCreateListOpen, setIsCreateListOpen] = useState(false);
  const [isEditListOpen, setIsEditListOpen] = useState(false);
  const addListButtonRef = useRef<HTMLButtonElement>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [insertionIndicator, setInsertionIndicator] = useState<{ sectionId: string; index: number } | null>(null);
  const [movingTask, setMovingTask] = useState<{ taskId: string; fromSection: string; toSection: string } | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    vencidas: true,
    hoje: true,
    amanha: true,
    'semana-que-vem': true,
    'sem-data': true,
    'eventos-futuros': true,
    'algum-dia': true,
    completadas: false,
  });

  const { 
    tasks, 
    isLoading, 
    error, 
    createTask,
    toggleTaskCompletion, 
    updateTask,
    deleteTask,
    undoDeleteTask,
    reorderTasks,
  } = useTasks();

  const { lists: customLists } = useLists();
  const mergedTaskCategories = useMergedTaskCategories();

  // Keep selectedTask completion in sync with global tasks state
  useEffect(() => {
    if (!selectedTask) return;
    const taskInState = tasks.find(t => t.id === selectedTask.id);
    if (!taskInState) return;
    if (taskInState.completed !== selectedTask.completed) {
      setSelectedTask(prev => {
        if (!prev || prev.id !== selectedTask.id) return prev;
        return { ...prev, completed: taskInState.completed };
      });
    }
  }, [tasks, selectedTask]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Simple handlers - no useCallback for now to keep it simple
  const handleToggleCompletion = async (taskId: string) => {
    // Update sidebar instantly as well (selectedTask is not automatically refreshed)
    if (selectedTask?.id === taskId) {
      setSelectedTask(prev => (prev ? { ...prev, completed: !prev.completed } : prev));
    }
    await toggleTaskCompletion(taskId);
  };

  const handleUpdateTask = async (taskId: string, taskData: any) => {
    await updateTask(taskId, taskData, false);
    // Update selectedTask if it's the one being updated
    if (selectedTask?.id === taskId) {
      setSelectedTask(prev => {
        if (!prev) return null;
        return {
          ...prev,
          title: taskData.title ?? prev.title,
          description: taskData.description ?? prev.description,
          priority: taskData.priority !== undefined ? taskData.priority : prev.priority,
          category: taskData.category !== undefined ? taskData.category : prev.category,
          completed: taskData.completed ?? prev.completed,
          due_date: taskData.dueDate !== undefined ? taskData.dueDate : prev.due_date,
          time: taskData.time !== undefined ? taskData.time : prev.time,
        };
      });
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      const deletedTask = await deleteTask(taskId, false);
      
      if (deletedTask) {
        // Close TaskDetailsSidebar if the deleted task is currently open
        if (selectedTask?.id === taskId) {
          setSelectedTask(null);
        }
        
        // Store reference to deleted task for use in callbacks
        const taskToRestore = deletedTask;
        
        // Show toast with undo button
        toast.success('Tarefa excluída com sucesso', {
          hasButton: true,
          action: {
            label: 'Desfazer',
            onClick: async () => {
              try {
                const success = await undoDeleteTask(taskToRestore.id);
                if (success) {
                  // Show toast with view button
                  // The task will be restored in the tasks list by undoDeleteTask
                  toast.success('Tarefa restaurada', {
                    hasButton: true,
                    action: {
                      label: 'Visualizar',
                      onClick: () => {
                        // Use the task data we stored - it should match the restored task
                        // The task is now in the tasks list, but we can use the original data
                        setSelectedTask(taskToRestore);
                      },
                    },
                  });
                }
              } catch (error) {
                console.error('Failed to restore task:', error);
              }
            },
          },
        });
      }
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const handleEdit = (task: any) => {
    setSelectedTask(task);
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
  };

  const handleDialogClose = () => {
    setSelectedTask(null);
  };

  const handleOpenDatePicker = (task: any) => {
    // Placeholder - can add date picker later
    console.log('Open date picker for:', task);
  };

  // Handler for ControlBar task creation
  const handleControlBarCreateTask = async (taskData: TaskCreationData): Promise<Task | undefined> => {
    try {
      const createdTask = await createTask({
        title: taskData.title,
        description: taskData.description || '',
        priority: taskData.priority, // Allow undefined - don't default to 'medium'
        category: taskData.category || '',
        dueDate: taskData.dueDate || '',
        important: false,
        time: '',
      });
      return createdTask;
    } catch (error) {
      console.error('Failed to create task:', error);
      return undefined;
    }
  };

  // QuickTaskCreator handler - NOT USED IN MVP INITIAL
  // Uncomment when QuickTaskCreator is re-enabled
  // const handleQuickCreate = useCallback(async (title: string, sectionId: string) => {
  //   const today = new Date();
  //   today.setHours(0, 0, 0, 0);
  //   
  //   let dueDate: string | undefined;
  //   
  //   switch (sectionId) {
  //     case 'vencidas': {
  //       const yesterday = new Date(today);
  //       yesterday.setDate(yesterday.getDate() - 1);
  //       dueDate = yesterday.toISOString().split('T')[0];
  //       break;
  //     }
  //     case 'hoje':
  //       dueDate = today.toISOString().split('T')[0];
  //       break;
  //     case 'amanha': {
  //       const tomorrow = new Date(today);
  //       tomorrow.setDate(tomorrow.getDate() + 1);
  //       dueDate = tomorrow.toISOString().split('T')[0];
  //       break;
  //     }
  //     case 'semana-que-vem': {
  //       const nextWeek = new Date(today);
  //       nextWeek.setDate(today.getDate() + 7);
  //       dueDate = nextWeek.toISOString().split('T')[0];
  //       break;
  //     }
  //     case 'sem-data':
  //       dueDate = undefined;
  //       break;
  //     case 'eventos-futuros': {
  //       const future = new Date(today);
  //       future.setDate(today.getDate() + 15);
  //       dueDate = future.toISOString().split('T')[0];
  //       break;
  //     }
  //     default:
  //       dueDate = undefined;
  //   }
  //   
  //   try {
  //     await createTask({
  //       title,
  //       description: '',
  //       priority: 'medium',
  //       category: '',
  //       dueDate,
  //       important: false,
  //       time: '',
  //     });
  //   } catch (error) {
  //     console.error('Erro ao criar tarefa:', error);
  //   }
  // }, [createTask]);

  // Get list name for header
  const getListName = (listType: ListType): string => {
    const listNames: Record<ListType, string> = {
      all: 'Tarefas',
      important: 'Prioridades',
      today: 'Hoje',
      tomorrow: 'Amanhã',
      week: 'Semana que vem',
      later: 'Mais pra frente',
      noDate: 'Sem data',
      overdue: 'Vencidas',
      completed: 'Concluídas',
    };
    return listNames[listType] || 'Tarefas';
  };

  // Apply custom list/category filters (keeps the same main view structure)
  const visibleTasks = useMemo(() => {
    if (selectedCustomListId) {
      const selectedListObj = customLists.find((l) => l.id === selectedCustomListId);
      if (!selectedListObj) return tasks;
      const allowed = new Set(selectedListObj.category_names || []);
      return tasks.filter((t) => !!t.category && allowed.has(t.category));
    }

    if (selectedCategoryName) {
      return tasks.filter((t) => t.category === selectedCategoryName);
    }

    return tasks;
  }, [tasks, selectedCustomListId, selectedCategoryName, customLists]);

  // Filter tasks based on selected list
  const filteredTasks = useMemo(() => {
    if (selectedList === 'all') {
      return visibleTasks;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const { start: nextWeekStartStr, end: nextWeekEndStr } = getNextWeekBounds(today);

    return visibleTasks.filter(task => {
      // For list views, we typically show incomplete tasks only
      // (completed tasks can be shown separately if needed)
      
      switch (selectedList) {
        case 'important':
          return task.important === true && !task.completed;
        case 'overdue':
          if (!task.due_date || task.completed) return false;
          const taskDateStr = task.due_date.split('T')[0];
          return taskDateStr < todayStr;
        case 'today':
          if (!task.due_date || task.completed) return false;
          return task.due_date.split('T')[0] === todayStr;
        case 'tomorrow':
          if (!task.due_date || task.completed) return false;
          return task.due_date.split('T')[0] === tomorrowStr;
        case 'week':
          if (!task.due_date || task.completed) return false;
          const weekTaskDateStr = task.due_date.split('T')[0];
          return weekTaskDateStr >= nextWeekStartStr && weekTaskDateStr < nextWeekEndStr;
        case 'noDate':
          return !task.due_date && !task.completed;
        case 'completed':
          return task.completed;
        default:
          return true;
      }
    });
  }, [visibleTasks, selectedList]);

  // Categorization based on due dates (following Figma structure)
  const categorizedTasks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const { start: nextWeekStartStr, end: nextWeekEndStr } = getNextWeekBounds(today);

    const categories = {
      vencidas: [] as Task[],
      hoje: [] as Task[],
      amanha: [] as Task[],
      semanaQueVem: [] as Task[],
      semData: [] as Task[],
      eventosFuturos: [] as Task[],
      algumDia: [] as Task[],
      completadas: [] as Task[],
    };

    visibleTasks.forEach(task => {
      // Skip task if it's being moved (will be added to target section)
      if (movingTask && movingTask.taskId === task.id) {
        return;
      }

      // Check if task is completed and has today's date - keep it in "hoje" section
      if (task.completed && task.due_date) {
        const taskDateStr = task.due_date.split('T')[0];
        if (taskDateStr === todayStr) {
          // Keep completed tasks with today's date in "hoje" section
          categories.hoje.push(task);
          return;
        }
      }

      // Separate other completed tasks
      if (task.completed) {
        categories.completadas.push(task);
        return;
      }

      // Categorize incomplete tasks by due date
      if (!task.due_date) {
        categories.semData.push(task);
        return;
      }

      const taskDateStr = task.due_date.split('T')[0];
      
      if (taskDateStr < todayStr) {
        categories.vencidas.push(task);
      } else if (taskDateStr === todayStr) {
        categories.hoje.push(task);
      } else if (taskDateStr === tomorrowStr) {
        categories.amanha.push(task);
      } else if (taskDateStr >= nextWeekStartStr && taskDateStr < nextWeekEndStr) {
        categories.semanaQueVem.push(task);
      } else {
        categories.eventosFuturos.push(task);
      }
    });

    // Sort "hoje" section: incomplete tasks first, completed tasks at the end
    categories.hoje.sort((a, b) => {
      if (a.completed && !b.completed) return 1; // completed after incomplete
      if (!a.completed && b.completed) return -1; // incomplete before completed
      return 0; // maintain original order within each group
    });

    // If a task is being moved, add it to the target section temporarily
    if (movingTask) {
      const movingTaskObj = visibleTasks.find(t => t.id === movingTask.taskId);
      if (movingTaskObj) {
        // Map section IDs to category keys
        const sectionMap: Record<string, keyof typeof categories> = {
          'vencidas': 'vencidas',
          'hoje': 'hoje',
          'amanha': 'amanha',
          'semana-que-vem': 'semanaQueVem',
          'sem-data': 'semData',
          'eventos-futuros': 'eventosFuturos',
          'algum-dia': 'algumDia',
          'completadas': 'completadas',
        };
        
        const targetKey = sectionMap[movingTask.toSection];
        if (targetKey) {
          categories[targetKey].push(movingTaskObj);
        }
      }
    }

    return categories;
  }, [visibleTasks, movingTask]);

  const sidebarCategories = useMemo(
    () =>
      mergedTaskCategories
        .map((category) => ({
          id: category.id,
          name: category.name,
          count: category.count,
        })),
    [mergedTaskCategories]
  );

  const popoverCategories = useMemo(
    () =>
      mergedTaskCategories.map((category) => ({
        id: category.id,
        name: category.name,
      })),
    [mergedTaskCategories]
  );

  const sidebarTaskCounts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const { start: nextWeekStartStr, end: nextWeekEndStr } = getNextWeekBounds(today);

    let important = 0;
    let overdue = 0;
    let todayCount = 0;
    let tomorrowCount = 0;
    let week = 0;
    let later = 0;
    let noDate = 0;
    let all = 0;

    tasks.forEach((task) => {
      if (task.completed) return;
      all += 1;

      if (task.important) important += 1;

      if (!task.due_date) {
        noDate += 1;
        return;
      }

      const dateStr = task.due_date.split('T')[0];

      if (dateStr < todayStr) {
        overdue += 1;
      } else if (dateStr === todayStr) {
        todayCount += 1;
      } else if (dateStr === tomorrowStr) {
        tomorrowCount += 1;
      } else if (dateStr >= nextWeekStartStr && dateStr < nextWeekEndStr) {
        week += 1;
      } else if (dateStr > tomorrowStr) {
        later += 1;
      }
    });

    return {
      all,
      important,
      overdue,
      today: todayCount,
      tomorrow: tomorrowCount,
      week,
      later,
      noDate,
    };
  }, [tasks]);

  const handleListSelect = (listType: ListType) => {
    setSelectedList(listType);
    setSelectedCustomListId(null);
    setSelectedCategoryName(null);
  };

  const handleCustomListSelect = (listId: string) => {
    setSelectedList('all');
    setSelectedCategoryName(null);
    setSelectedCustomListId((prev) => (prev === listId ? null : listId));
  };

  const handleCategorySelect = (categoryName: string) => {
    setSelectedList('all');
    setSelectedCustomListId(null);
    setSelectedCategoryName((prev) => (prev === categoryName ? null : categoryName));
  };

  const pageTitle =
    selectedCustomListId
      ? customLists.find((l) => l.id === selectedCustomListId)?.name || 'Tarefas'
      : selectedCategoryName
        ? selectedCategoryName
        : getListName(selectedList);
  const selectedCustomList = selectedCustomListId
    ? customLists.find((l) => l.id === selectedCustomListId) || null
    : null;
  const isCustomListView = Boolean(selectedCustomList);
  const pageDescription = selectedCustomList?.description?.trim() || undefined;
  const headerActions = isCustomListView ? (
    <Button
      type="button"
      variant="secondary"
      size="small"
      icon={Gear}
      iconPosition="left"
      onClick={() => setIsEditListOpen(true)}
    >
      Editar
    </Button>
  ) : undefined;

  useEffect(() => {
    if (!selectedCustomListId) {
      setIsEditListOpen(false);
    }
  }, [selectedCustomListId]);

  const sidebarNode = (
    <>
      <TasksSidebar
        selectedList={selectedList}
        selectedCustomListId={selectedCustomListId}
        selectedCategory={selectedCategoryName}
        onListSelect={handleListSelect}
        onCustomListSelect={handleCustomListSelect}
        onCategorySelect={handleCategorySelect}
        onAddClick={() => setIsCreateListOpen(true)}
        addButtonRef={addListButtonRef}
        taskCounts={sidebarTaskCounts}
        categories={sidebarCategories}
        customLists={customLists.map((l) => ({ id: l.id, name: l.name }))}
      />
      <CreateListPopover
        isOpen={isCreateListOpen}
        onClose={() => setIsCreateListOpen(false)}
        categories={popoverCategories}
      />
      <CreateListPopover
        isOpen={isEditListOpen}
        onClose={() => setIsEditListOpen(false)}
        mode="edit"
        categories={popoverCategories}
        listToEdit={selectedCustomList
          ? {
              id: selectedCustomList.id,
              name: selectedCustomList.name,
              description: selectedCustomList.description,
              categoryNames: selectedCustomList.category_names || [],
            }
          : null}
        onDeleted={() => {
          setIsEditListOpen(false);
          setSelectedCustomListId(null);
          setSelectedList('all');
        }}
      />
    </>
  );

  // ============================================================================
  // DND HANDLERS
  // ============================================================================

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const task = tasks.find(t => t.id === active.id);
    setActiveTask(task || null);
  }, [tasks]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || !active.data.current?.task) {
      setInsertionIndicator(null);
      return;
    }

    const overTask = over.data.current?.task;
    const overSection = over.data.current?.section;
    
    // If dragging over a task, show insertion indicator at that position
    if (overTask && overSection) {
      const sectionTasks = categorizedTasks[overSection as keyof typeof categorizedTasks] || [];
      const overIndex = sectionTasks.findIndex(task => task.id === overTask.id) ?? -1;
      
      if (overIndex !== -1) {
        setInsertionIndicator({ sectionId: overSection, index: overIndex });
      }
    } 
    // If dragging over an empty section, clear insertion indicator
    else if (over.id && typeof over.id === 'string' && over.id.startsWith('section-')) {
      setInsertionIndicator(null);
    } else {
      setInsertionIndicator(null);
    }
  }, [categorizedTasks]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      setActiveTask(null);
      setInsertionIndicator(null);
      return;
    }

    const draggedTask = active.data.current?.task;
    const overSection = over.data.current?.section;
    const overTask = over.data.current?.task;
    const currentSection = active.data.current?.section;

    if (!draggedTask) {
      setActiveTask(null);
      setInsertionIndicator(null);
      return;
    }

    // Reordering within same section
    if (overTask && draggedTask.id !== overTask.id) {
      if (currentSection === overSection) {
        const allTasks = [...tasks];
        const activeTaskIndex = allTasks.findIndex(t => t.id === draggedTask.id);
        const overTaskIndex = allTasks.findIndex(t => t.id === overTask.id);
        
        if (activeTaskIndex !== -1 && overTaskIndex !== -1) {
          const reorderedTasks = arrayMove(allTasks, activeTaskIndex, overTaskIndex);
          reorderTasks(reorderedTasks);
        }
        setActiveTask(null);
        setInsertionIndicator(null);
        return;
      }
    }

    // Moving to different section - show animation
    if (!overSection || currentSection === overSection) {
      setActiveTask(null);
      setInsertionIndicator(null);
      return;
    }

    // Set moving state to trigger animation
    setMovingTask({
      taskId: draggedTask.id,
      fromSection: currentSection || '',
      toSection: overSection,
    });

    // Clear drag states immediately
    setActiveTask(null);
    setInsertionIndicator(null);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const { start: nextWeekStartStr, end: nextWeekEndStr } = getNextWeekBounds(today);
    
    let newDueDate: string | undefined;
    switch (overSection) {
      case 'vencidas':
        // Keep original date if it's in the past, otherwise set to yesterday
        if (draggedTask.due_date) {
          const taskDateStr = draggedTask.due_date.split('T')[0];
          newDueDate = taskDateStr < todayStr ? taskDateStr : todayStr;
        } else {
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          newDueDate = yesterday.toISOString().split('T')[0];
        }
        break;
      case 'hoje':
        newDueDate = todayStr;
        break;
      case 'amanha':
        newDueDate = tomorrowStr;
        break;
      case 'semana-que-vem':
        // Set to start of next week
        newDueDate = nextWeekStartStr;
        break;
      case 'sem-data':
        newDueDate = undefined;
        break;
      case 'eventos-futuros':
        // Set to 15 days from today
        newDueDate = nextWeekEndStr;
        break;
      default:
        return;
    }

    try {
      await updateTask(draggedTask.id, {
        title: draggedTask.title,
        description: draggedTask.description,
        priority: draggedTask.priority,
        category: draggedTask.category,
        completed: draggedTask.completed,
        dueDate: newDueDate,
      }, false);
      
      // Clear moving state after animation completes (wait for both update and animation)
      // The task will now appear in the correct section naturally after the update
      setTimeout(() => {
        setMovingTask(null);
      }, 400);
    } catch (error) {
      console.error('Erro ao atualizar tarefa:', error);
      setMovingTask(null);
    }
  }, [tasks, updateTask, reorderTasks]);

  // ============================================================================
  // DROPPABLE SECTION COMPONENT
  // ============================================================================

  const DroppableSection: React.FC<{ 
    title: string;
    tasks: Task[];
    emptyMessage: string;
    sectionId: string;
    defaultOpen?: boolean;
    isOpen?: boolean;
    onOpenChange?: (isOpen: boolean) => void;
    onToggleCompletion: (taskId: string) => Promise<void>;
    onEdit: (task: Task) => void;
    onDelete: (taskId: string) => Promise<void>;
    onUpdateTask: (taskId: string, taskData: any) => Promise<void>;
    onOpenDatePicker: (task: Task) => void;
    onClick?: (task: Task) => void;
    insertionIndicator: { sectionId: string; index: number } | null;
    movingTask: { taskId: string; fromSection: string; toSection: string } | null;
    selectedTaskId?: string | null;
    hideCategoryChip?: boolean;
    // onQuickCreate?: (title: string, sectionId: string) => Promise<void>; // NOT USED IN MVP INITIAL
  }> = memo(({ 
    title, 
    tasks: sectionTasks, 
    emptyMessage, 
    sectionId, 
    defaultOpen = true,
    isOpen: controlledIsOpen,
    onOpenChange,
    onToggleCompletion,
    onEdit,
    onDelete,
    onUpdateTask,
    onOpenDatePicker,
    onClick,
    insertionIndicator,
    movingTask,
    selectedTaskId,
    hideCategoryChip = false,
    // onQuickCreate, // NOT USED IN MVP INITIAL
  }) => {
    const { setNodeRef, isOver } = useDroppable({
      id: sectionId,
      data: {
        section: sectionId,
      },
    });

    const isTargetSection = movingTask?.toSection === sectionId;
    const isSourceSection = movingTask?.fromSection === sectionId;

    const content = (
      <div 
        ref={setNodeRef}
        className={`${styles.sectionContent} ${isOver ? styles.sectionOver : ''} ${sectionTasks.length === 0 ? styles.sectionEmpty : ''}`}
      >
        {sectionTasks.length > 0 ? (
          <SortableContext items={sectionTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
            <AnimatePresence mode="popLayout">
              {sectionTasks.map((task, index) => {
                const isMoving = movingTask?.taskId === task.id;
                const isNewlyMoved = isMoving && isTargetSection;
                const isLeaving = isMoving && isSourceSection;
                
                return (
                  <motion.div
                    key={task.id}
                    initial={isNewlyMoved ? { 
                      opacity: 0, 
                      scale: 0.9,
                      y: -15,
                    } : undefined}
                    animate={isNewlyMoved ? { 
                      opacity: 1, 
                      scale: 1,
                      y: 0,
                    } : isLeaving ? {
                      opacity: 0,
                      scale: 0.9,
                      y: -10,
                    } : {
                      opacity: 1,
                      scale: 1,
                      y: 0,
                    }}
                    exit={isLeaving ? {
                      opacity: 0,
                      scale: 0.9,
                      y: -10,
                    } : undefined}
                    transition={{
                      duration: 0.25,
                      ease: [0.4, 0, 0.2, 1],
                    }}
                    layout
                  >
                    <TaskItem
                      task={task}
                      section={sectionId}
                      onToggleCompletion={onToggleCompletion}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onUpdateTask={onUpdateTask}
                      onOpenDatePicker={onOpenDatePicker}
                      onClick={onClick}
                      showInsertionLine={insertionIndicator?.sectionId === sectionId && insertionIndicator?.index === index}
                      isActive={selectedTaskId === task.id}
                      hideCategoryChip={hideCategoryChip}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </SortableContext>
        ) : (
          <div className={`${styles.emptyState} ${isOver ? styles.emptyStateOver : ''}`}>
            {isOver ? "✨ Solte aqui para mover" : emptyMessage}
          </div>
        )}
        {/* QuickTaskCreator - NOT USED IN MVP INITIAL */}
        {/* {sectionId !== 'completadas' && onQuickCreate && (
          <QuickTaskCreator
            sectionId={sectionId}
            onQuickCreate={onQuickCreate}
            hasTasks={sectionTasks.length > 0}
          />
        )} */}
      </div>
    );

    return (
      <Collapsible 
        label={title} 
        defaultOpen={defaultOpen}
        isOpen={controlledIsOpen}
        onOpenChange={onOpenChange}
        disabled={sectionTasks.length === 0}
      >
        {content}
      </Collapsible>
    );
  });

  if (isLoading) {
    return (
      <MainLayout
        sidebar={sidebarNode}
        title={pageTitle}
        titleVariant={isCustomListView ? 'heading' : 'display'}
        titleDescription={pageDescription}
        headerActions={headerActions}
        activePage="tasks"
        onCreateTask={handleControlBarCreateTask}
        rightSidebar={selectedTask ? (
          <TaskDetailsSidebar
            isOpen={true}
            task={selectedTask}
            onClose={handleDialogClose}
            onUpdateTask={handleUpdateTask}
            onToggleCompletion={handleToggleCompletion}
          />
        ) : undefined}
      >
        <div className={styles.loading}>Carregando tarefas...</div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout
        sidebar={sidebarNode}
        title={pageTitle}
        titleVariant={isCustomListView ? 'heading' : 'display'}
        titleDescription={pageDescription}
        headerActions={headerActions}
        activePage="tasks"
        onCreateTask={handleControlBarCreateTask}
        rightSidebar={selectedTask ? (
          <TaskDetailsSidebar
            isOpen={true}
            task={selectedTask}
            onClose={handleDialogClose}
            onUpdateTask={handleUpdateTask}
            onToggleCompletion={handleToggleCompletion}
          />
        ) : undefined}
      >
        <div className={styles.error}>Erro: {error}</div>
      </MainLayout>
    );
  }

  // If a specific list is selected (not "all"), show simple list without Collapsible
  if (selectedList !== 'all' || selectedCustomListId) {
    const simpleViewTasks = selectedCustomListId ? visibleTasks : filteredTasks;
    const simpleViewSection = selectedCustomListId ? 'custom-list' : selectedList;

    return (
      <MainLayout
        sidebar={sidebarNode}
        title={pageTitle}
        titleVariant={isCustomListView ? 'heading' : 'display'}
        titleDescription={pageDescription}
        headerActions={headerActions}
        activePage="tasks"
        onCreateTask={handleControlBarCreateTask}
        rightSidebar={selectedTask ? (
          <TaskDetailsSidebar
            isOpen={true}
            task={selectedTask}
            onClose={handleDialogClose}
            onUpdateTask={handleUpdateTask}
            onToggleCompletion={handleToggleCompletion}
          />
        ) : undefined}
      >
        <div className={styles.content}>
          <div className={styles.sectionContent}>
            {simpleViewTasks.length > 0 ? (
              simpleViewTasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  section={simpleViewSection}
                  onToggleCompletion={handleToggleCompletion}
                  onEdit={handleEdit}
                  onDelete={handleDeleteTask}
                  onUpdateTask={handleUpdateTask}
                  onOpenDatePicker={handleOpenDatePicker}
                  onClick={handleTaskClick}
                  showInsertionLine={false}
                  isActive={selectedTask?.id === task.id}
                  hideCategoryChip={!!selectedTask}
                />
              ))
            ) : (
              <div className={styles.emptyState}>
                Nenhuma tarefa nesta lista
              </div>
            )}
          </div>
        </div>
      </MainLayout>
    );
  }

  // Default view: "all" selected - show categorized tasks with Collapsible
  return (
    <MainLayout
      sidebar={sidebarNode}
      title={pageTitle}
      titleVariant={isCustomListView ? 'heading' : 'display'}
      titleDescription={pageDescription}
      headerActions={headerActions}
      activePage="tasks"
      onCreateTask={handleControlBarCreateTask}
      onOpenTaskDetails={handleTaskClick}
      rightSidebar={selectedTask ? (
        <TaskDetailsSidebar
          isOpen={true}
          task={selectedTask}
          onClose={handleDialogClose}
          onUpdateTask={handleUpdateTask}
          onToggleCompletion={handleToggleCompletion}
          onDelete={handleDeleteTask}
        />
      ) : undefined}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className={styles.content}>
          {/* Vencidas */}
          <DroppableSection
            title="Vencidas"
            tasks={categorizedTasks.vencidas}
            emptyMessage="Nenhuma tarefa vencida"
            sectionId="vencidas"
            defaultOpen={true}
            isOpen={openSections.vencidas}
            onOpenChange={(isOpen) => setOpenSections(prev => ({ ...prev, vencidas: isOpen }))}
            onToggleCompletion={handleToggleCompletion}
            onEdit={handleEdit}
            onDelete={handleDeleteTask}
            onUpdateTask={handleUpdateTask}
            onOpenDatePicker={handleOpenDatePicker}
            onClick={handleTaskClick}
            insertionIndicator={insertionIndicator}
            movingTask={movingTask}
            selectedTaskId={selectedTask?.id}
            hideCategoryChip={!!selectedTask}
            // onQuickCreate={handleQuickCreate} // NOT USED IN MVP INITIAL
          />

          {/* Hoje */}
          <DroppableSection
            title="Hoje"
            tasks={categorizedTasks.hoje}
            emptyMessage="Nenhuma tarefa para hoje"
            sectionId="hoje"
            defaultOpen={true}
            isOpen={openSections.hoje}
            onOpenChange={(isOpen) => setOpenSections(prev => ({ ...prev, hoje: isOpen }))}
            onToggleCompletion={handleToggleCompletion}
            onEdit={handleEdit}
            onDelete={handleDeleteTask}
            onUpdateTask={handleUpdateTask}
            onOpenDatePicker={handleOpenDatePicker}
            onClick={handleTaskClick}
            insertionIndicator={insertionIndicator}
            movingTask={movingTask}
            selectedTaskId={selectedTask?.id}
            hideCategoryChip={!!selectedTask}
            // onQuickCreate={handleQuickCreate} // NOT USED IN MVP INITIAL
          />

          {/* Amanhã */}
          <DroppableSection
            title="Amanhã"
            tasks={categorizedTasks.amanha}
            emptyMessage="Nenhuma tarefa para amanhã"
            sectionId="amanha"
            defaultOpen={true}
            isOpen={openSections.amanha}
            onOpenChange={(isOpen) => setOpenSections(prev => ({ ...prev, amanha: isOpen }))}
            onToggleCompletion={handleToggleCompletion}
            onEdit={handleEdit}
            onDelete={handleDeleteTask}
            onUpdateTask={handleUpdateTask}
            onOpenDatePicker={handleOpenDatePicker}
            onClick={handleTaskClick}
            insertionIndicator={insertionIndicator}
            movingTask={movingTask}
            selectedTaskId={selectedTask?.id}
            hideCategoryChip={!!selectedTask}
            // onQuickCreate={handleQuickCreate} // NOT USED IN MVP INITIAL
          />

          {/* Semana que vem */}
          <DroppableSection
            title="Semana que vem"
            tasks={categorizedTasks.semanaQueVem}
            emptyMessage="Nenhuma tarefa para a semana que vem"
            sectionId="semana-que-vem"
            defaultOpen={true}
            isOpen={openSections['semana-que-vem']}
            onOpenChange={(isOpen) => setOpenSections(prev => ({ ...prev, 'semana-que-vem': isOpen }))}
            onToggleCompletion={handleToggleCompletion}
            onEdit={handleEdit}
            onDelete={handleDeleteTask}
            onUpdateTask={handleUpdateTask}
            onOpenDatePicker={handleOpenDatePicker}
            onClick={handleTaskClick}
            insertionIndicator={insertionIndicator}
            movingTask={movingTask}
            selectedTaskId={selectedTask?.id}
            hideCategoryChip={!!selectedTask}
            // onQuickCreate={handleQuickCreate} // NOT USED IN MVP INITIAL
          />

         

          {/* Eventos Futuros */}
          {categorizedTasks.eventosFuturos.length > 0 && (
            <DroppableSection
              title="Mais pra Frente"
              tasks={categorizedTasks.eventosFuturos}
              emptyMessage="Nenhum evento futuro"
              sectionId="eventos-futuros"
              defaultOpen={true}
              isOpen={openSections['eventos-futuros']}
              onOpenChange={(isOpen) => setOpenSections(prev => ({ ...prev, 'eventos-futuros': isOpen }))}
              onToggleCompletion={handleToggleCompletion}
              onEdit={handleEdit}
              onDelete={handleDeleteTask}
              onUpdateTask={handleUpdateTask}
              onOpenDatePicker={handleOpenDatePicker}
              onClick={handleTaskClick}
              insertionIndicator={insertionIndicator}
              movingTask={movingTask}
              selectedTaskId={selectedTask?.id}
              hideCategoryChip={!!selectedTask}
              // onQuickCreate={handleQuickCreate} // NOT USED IN MVP INITIAL
            />
          )}

           {/* Sem data */}
           <DroppableSection
            title="Sem data ainda"
            tasks={categorizedTasks.semData}
            emptyMessage="Nenhuma tarefa sem data"
            sectionId="sem-data"
            defaultOpen={true}
            isOpen={openSections['sem-data']}
            onOpenChange={(isOpen) => setOpenSections(prev => ({ ...prev, 'sem-data': isOpen }))}
            onToggleCompletion={handleToggleCompletion}
            onEdit={handleEdit}
            onDelete={handleDeleteTask}
            onUpdateTask={handleUpdateTask}
            onOpenDatePicker={handleOpenDatePicker}
            onClick={handleTaskClick}
            insertionIndicator={insertionIndicator}
            movingTask={movingTask}
            selectedTaskId={selectedTask?.id}
            hideCategoryChip={!!selectedTask}
            // onQuickCreate={handleQuickCreate} // NOT USED IN MVP INITIAL
          />

          {/* Tarefas Concluídas */}
          {categorizedTasks.completadas.length > 0 && (
            <DroppableSection
              title="Tarefas Concluídas"
              tasks={categorizedTasks.completadas}
              emptyMessage="Nenhuma tarefa concluída"
              sectionId="completadas"
              defaultOpen={false}
              isOpen={openSections.completadas}
              onOpenChange={(isOpen) => setOpenSections(prev => ({ ...prev, completadas: isOpen }))}
              onToggleCompletion={handleToggleCompletion}
              onEdit={handleEdit}
              onDelete={handleDeleteTask}
              onUpdateTask={handleUpdateTask}
              onOpenDatePicker={handleOpenDatePicker}
              onClick={handleTaskClick}
              insertionIndicator={insertionIndicator}
              movingTask={movingTask}
              selectedTaskId={selectedTask?.id}
              hideCategoryChip={!!selectedTask}
            />
          )}
        </div>

        <DragOverlay>
          {activeTask ? (
            <div style={{ opacity: 0.5 }}>
              <TaskItem
                task={activeTask}
                section={activeTask.due_date ? 'hoje' : 'sem-data'}
                onToggleCompletion={handleToggleCompletion}
                onEdit={handleEdit}
                onDelete={handleDeleteTask}
                onUpdateTask={handleUpdateTask}
                onOpenDatePicker={handleOpenDatePicker}
                showInsertionLine={false}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </MainLayout>
  );
}

