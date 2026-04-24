/**
 * Tasks Page
 * 
 * Main tasks page with categorized sections and drag-and-drop support
 */

import { useState, useMemo, useCallback, memo, useEffect, useRef } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { Gear, CirclesFour, ArrowsInLineVertical, ArrowsOutLineVertical, FunnelSimple } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useTasks, Task } from '../../contexts/TaskContext';
import type { ToolCallData } from '../../hooks/useChatStream';
import { useLists } from '../../contexts/ListContext';
import { PendingTaskCard, TaskItem, TaskDetailsSidebar, PendingTaskDetailsSidebar } from '../../components/features/tasks';
import type { PendingTask } from '../../hooks/usePendingTasks';
import { AIChatPanel } from '../../components/features/tasks/AIChatPanel';
import { MainLayout } from '../../components/layout';
import { Sidebar, ListType } from '../../components/layout/Sidebar';
import type { SettingsPage } from '../../components/layout/Sidebar';
import { Button, TaskCreationData, Collapsible, Tooltip, CalendarListItem } from '../../components/ui';
import { WeekNavigator } from '../../components/ui/WeekNavigator/WeekNavigator';
import { toast } from '../../components/ui/Sonner';
import { CreateListPopover } from '../../components/features/tasks/CreateListPopover/CreateListPopover';
import { FilterPopover, DEFAULT_FILTER_STATE } from '../../components/features/tasks/FilterPopover/FilterPopover';
import type { FilterState } from '../../components/features/tasks/FilterPopover/FilterPopover';
import { TaskEmptyState } from '../../components/features/tasks/EmptyState';
import { useMergedTaskCategories } from '../../hooks/useMergedTaskCategories';
import { usePendingTasks } from '../../hooks/usePendingTasks';
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

/**
 * Calcula o intervalo de "esta semana" para tarefas futuras:
 * do dia depois de amanhã até antes da próxima segunda-feira.
 */
function getCurrentWeekUpcomingBounds(today: Date): { start: string; end: string } {
  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(today.getDate() + 2);

  const { start: nextWeekStartStr } = getNextWeekBounds(today);

  return {
    start: dayAfterTomorrow.toISOString().split('T')[0],
    end: nextWeekStartStr,
  };
}

/**
 * Retorna o intervalo da semana atual (segunda a domingo inclusive),
 * como strings YYYY-MM-DD para comparação.
 * O `end` é exclusivo (segunda-feira da semana seguinte).
 */
function getCurrentWeekBounds(today: Date): { start: string; end: string } {
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, …, 6 = Saturday
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const monday = new Date(today);
  monday.setDate(today.getDate() - daysFromMonday);
  monday.setHours(0, 0, 0, 0);

  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);

  return {
    start: monday.toISOString().split('T')[0],
    end: nextMonday.toISOString().split('T')[0],
  };
}

/**
 * Retorna os 7 dias da semana atual (segunda a domingo),
 * como objetos Date normalizados à meia-noite local.
 */
function getCurrentWeekDays(today: Date): Date[] {
  const { start } = getCurrentWeekBounds(today);
  const monday = new Date(`${start}T00:00:00`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

const PT_DAY_ABBREV = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;


// ── Module-level constants (stable, never recreated) ─────────────────────────

/** Default open/collapsed state for every section in the all-view. */
const ALL_SECTIONS_OPEN: Record<string, boolean> = {
  integracoes: true,
  vencidas: true,
  hoje: true,
  amanha: true,
  'esta-semana': true,
  'semana-que-vem': true,
  'sem-data': true,
  'eventos-futuros': true,
  'algum-dia': true,
  completadas: false,
};


// ─────────────────────────────────────────────────────────────────────────────

export function Tasks() {
  const [selectedList, setSelectedList] = useState<ListType>('all');
  const [selectedCustomListId, setSelectedCustomListId] = useState<string | null>(null);
  const [selectedCategoryName, setSelectedCategoryName] = useState<string | null>(null);
  const [isCreateListOpen, setIsCreateListOpen] = useState(false);
  const [isEditListOpen, setIsEditListOpen] = useState(false);
  const addListButtonRef = useRef<HTMLButtonElement>(null);
  // Ref forwarded to MainLayout's .mainBody — used as IntersectionObserver root
  const mainBodyRef = useRef<HTMLDivElement>(null);

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [insertionIndicator, setInsertionIndicator] = useState<{ sectionId: string; index: number } | null>(null);
  const [movingTask, setMovingTask] = useState<{ taskId: string; fromSection: string; toSection: string } | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedPendingTask, setSelectedPendingTask] = useState<PendingTask | null>(null);
  const [expandedFromList, setExpandedFromList] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMode, setChatMode] = useState<'task' | 'general'>('general');
  const [chatInitialMessage, setChatInitialMessage] = useState<string | undefined>(undefined);
  const [chatKey, setChatKey] = useState(0);
  const [isCustomListCompletedOpen, setIsCustomListCompletedOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(ALL_SECTIONS_OPEN);
  const [weekSectionOpen, setWeekSectionOpen] = useState<Record<string, boolean>>({});
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<FilterState>(DEFAULT_FILTER_STATE);
  const filterAnchorRef = useRef<HTMLDivElement>(null);
  const [futureViewWeekStart, setFutureViewWeekStart] = useState<string | null>(null);
  const [selectedFutureDay, setSelectedFutureDay] = useState<string | null>(null);

  const isCompactHeader = useMediaQuery('(max-width: 824px)');
  const openSettingsRef = useRef<((page: SettingsPage) => void) | null>(null);


  const queryClient = useQueryClient();
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
  const {
    pendingTasks,
    isLoading: isPendingTasksLoading,
    error: pendingTasksError,
    confirm: confirmPendingTask,
    reject: rejectPendingTask,
    update: updatePendingTask,
  } = usePendingTasks();

  useEffect(() => {
    // Keep selectedTask completion in sync with global tasks state
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
    setExpandedFromList(isChatOpen);
    setSelectedTask(task);
  };

  const handleTaskClick = (task: Task) => {
    setExpandedFromList(isChatOpen);
    setSelectedTask(task);
    setSelectedPendingTask(null);
  };

  const handleDialogClose = () => {
    setSelectedTask(null);
    setSelectedPendingTask(null);
    setExpandedFromList(false);
    setIsChatOpen(false);
  };

  const handlePendingTaskClick = (task: PendingTask) => {
    setSelectedPendingTask((prev) => (prev?.id === task.id ? null : task));
    setSelectedTask(null);
  };

  const handlePendingTaskSidebarClose = () => {
    setSelectedPendingTask(null);
  };

  const handleTaskDetailsCenterClose = useCallback(() => {
    setSelectedTask(null);
    setExpandedFromList(false);
    if (chatMode === 'task') {
      setIsChatOpen(false);
    }
  }, [chatMode]);

  const handleOpenChatFromTask = useCallback(() => {
    setExpandedFromList(false);
    setChatMode('task');
    setIsChatOpen(true);
  }, []);

  const handleOpenChatGeneral = useCallback((text?: string) => {
    setChatMode('general');
    setExpandedFromList(false);
    if (text) {
      // Force a fresh panel so the initial message is always sent cleanly
      setChatKey((k) => k + 1);
      setChatInitialMessage(text);
    }
    setIsChatOpen(true);
  }, []);

  const handleCloseChat = useCallback(() => {
    setIsChatOpen(false);
    setChatInitialMessage(undefined);
  }, []);

  const handleChatTaskCardClick = useCallback((taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (task) setSelectedTask(task);
  }, [tasks]);

  const handleChatListCardClick = useCallback((listId: string) => {
    setSelectedCustomListId(listId);
    setSelectedCategoryName(null);
  }, []);

  const handleChatCategoryCardClick = useCallback((categoryName: string) => {
    setSelectedCategoryName(categoryName);
    setSelectedCustomListId(null);
  }, []);

  const handleChatTaskMutated = useCallback((toolCalls: ToolCallData[]) => {
    toolCalls.forEach((tc) => {
      if (!tc.result?.success || !tc.result.data) return;
      const d = tc.result.data;

      switch (tc.toolName) {
        case 'create_task': {
          const newTask: Task = {
            id: d.id as string,
            user_id: '',
            title: d.title as string,
            description: (d.description as string | undefined) ?? undefined,
            completed: false,
            priority: (d.priority as Task['priority']) || 'medium',
            category: (d.category as string | undefined) ?? undefined,
            due_date: (d.due_date as string | undefined) ?? undefined,
            important: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          queryClient.setQueryData<Task[]>(['tasks'], (old) => [...(old ?? []), newTask]);
          break;
        }
        case 'update_task': {
          const updatedId = d.id as string;
          const patch = {
            title: d.title as string | undefined,
            description: d.description as string | undefined,
            priority: d.priority as Task['priority'] | undefined,
            category: d.category as string | undefined,
            due_date: d.due_date as string | undefined,
            completed: d.completed as boolean | undefined,
          };
          // Update query cache immediately so the list reflects changes
          queryClient.setQueryData<Task[]>(['tasks'], (old) =>
            (old ?? []).map((t) =>
              t.id === updatedId
                ? {
                    ...t,
                    ...(patch.title !== undefined && { title: patch.title }),
                    ...(patch.description !== undefined && { description: patch.description }),
                    ...(patch.priority !== undefined && { priority: patch.priority }),
                    ...(patch.category !== undefined && { category: patch.category }),
                    ...(patch.due_date !== undefined && { due_date: patch.due_date }),
                    ...(patch.completed !== undefined && { completed: patch.completed }),
                  }
                : t,
            ),
          );
          // Also update the open sidebar immediately
          setSelectedTask((prev) => {
            if (!prev || prev.id !== updatedId) return prev;
            return {
              ...prev,
              ...(patch.title !== undefined && { title: patch.title }),
              ...(patch.description !== undefined && { description: patch.description }),
              ...(patch.priority !== undefined && { priority: patch.priority }),
              ...(patch.category !== undefined && { category: patch.category }),
              ...(patch.due_date !== undefined && { due_date: patch.due_date }),
              ...(patch.completed !== undefined && { completed: patch.completed }),
            };
          });
          break;
        }
        case 'complete_task':
          queryClient.setQueryData<Task[]>(['tasks'], (old) =>
            (old ?? []).map((t) =>
              t.id === (d.id as string) ? { ...t, completed: true } : t,
            ),
          );
          break;
        case 'delete_task':
          queryClient.setQueryData<Task[]>(['tasks'], (old) =>
            (old ?? []).filter((t) => t.id !== (d.id as string)),
          );
          break;
        case 'create_list':
        case 'update_list':
        case 'delete_list':
          queryClient.invalidateQueries({ queryKey: ['lists'] });
          break;
        case 'create_category':
        case 'update_category':
        case 'delete_category':
          queryClient.invalidateQueries({ queryKey: ['categories'] });
          break;
        default:
          break;
      }
    });

    // Always follow up with a refetch to ensure consistency with the server
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  }, [queryClient]);

  const handleOpenDatePicker = (task: any) => {
    // Placeholder - can add date picker later
    console.log('Open date picker for:', task);
  };

  const handleConfirmPendingTask = useCallback(async (pendingTaskId: string) => {
    try {
      await confirmPendingTask(pendingTaskId);
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    } catch (error) {
      console.error('Failed to confirm pending task:', error);
      toast.error('Não foi possível confirmar a tarefa pendente.');
    }
  }, [confirmPendingTask, queryClient]);

  const handleRejectPendingTask = useCallback(async (pendingTaskId: string) => {
    try {
      await rejectPendingTask(pendingTaskId);
    } catch (error) {
      console.error('Failed to reject pending task:', error);
      toast.error('Não foi possível rejeitar a tarefa pendente.');
    }
  }, [rejectPendingTask]);

  const handleUpdatePendingTask = useCallback(async (
    pendingTaskId: string,
    updates: {
      title?: string;
      description?: string | null;
      priority?: 'low' | 'medium' | 'high' | null;
      dueDate?: string | null;
      time?: string | null;
      category?: string | null;
    }
  ) => {
    try {
      await updatePendingTask(pendingTaskId, updates);
      toast.success('Sugestão de tarefa atualizada.');
    } catch (error) {
      console.error('Failed to update pending task:', error);
      toast.error('Não foi possível atualizar a sugestão de tarefa.');
    }
  }, [updatePendingTask]);

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
      all: 'Todas as tarefas',
      important: 'Prioridades',
      today: 'Hoje',
      tomorrow: 'Amanhã',
      week: 'Esta semana',
      later: 'Futuro',
      noDate: 'Sem data',
      overdue: 'Vencidas',
      completed: 'Concluídas',
    };
    return listNames[listType] || 'Tarefas';
  };

  // Apply custom list/category filters (keeps the same main view structure)
  const visibleTasks = useMemo(() => {
    let result = tasks;

    if (selectedCustomListId) {
      const selectedListObj = customLists.find((l) => l.id === selectedCustomListId);
      if (!selectedListObj) return tasks;

      // Apply category filter from list
      const allowed = new Set(selectedListObj.category_names || []);
      if (allowed.size > 0) {
        result = result.filter((t) => !!t.category && allowed.has(t.category));
      }

      // Apply priority filter from list
      if (selectedListObj.priority) {
        result = result.filter((t) => t.priority === selectedListObj.priority);
      }

      // Apply connected app filter from list
      if (selectedListObj.connected_app === 'whatsapp') {
        result = result.filter((t) => !!t.original_whatsapp_content);
      }

      // Apply no-category filter from list
      if (selectedListObj.filter_no_category) {
        result = result.filter((t) => !t.category);
      }

      // Apply show_completed filter from list
      if (selectedListObj.show_completed === false) {
        result = result.filter((t) => !t.completed);
      }
    } else if (selectedCategoryName) {
      result = tasks.filter((t) => t.category === selectedCategoryName);
    }

    // Apply popover filters
    if (activeFilters.priority) {
      result = result.filter((t) => t.priority === activeFilters.priority);
    }
    if (activeFilters.category.length > 0) {
      result = result.filter((t) => !!t.category && activeFilters.category.includes(t.category));
    }
    if (activeFilters.connectedApp === 'whatsapp') {
      result = result.filter((t) => !!t.original_whatsapp_content);
    }
    if (!activeFilters.showCompleted) {
      result = result.filter((t) => !t.completed);
    }

    return result;
  }, [tasks, selectedCustomListId, selectedCategoryName, customLists, activeFilters]);

  // Filter tasks based on selected list
  const filteredTasks = useMemo(() => {
    if (selectedList === 'all') {
      return visibleTasks;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const { start: nextWeekStartStr } = getNextWeekBounds(today);

    return visibleTasks.filter(task => {
      switch (selectedList) {
        case 'important':
          return task.important === true && !task.completed;
        case 'overdue': {
          if (!task.due_date || task.completed) return false;
          return task.due_date.split('T')[0] < todayStr;
        }
        case 'today':
          if (!task.due_date || task.completed) return false;
          return task.due_date.split('T')[0] === todayStr;
        case 'tomorrow': {
          const tomorrow = new Date(today);
          tomorrow.setDate(today.getDate() + 1);
          if (!task.due_date || task.completed) return false;
          return task.due_date.split('T')[0] === tomorrow.toISOString().split('T')[0];
        }
        case 'week': {
          // "Esta semana" = segunda a domingo da semana atual (inclui dias passados para exibição agrupada)
          if (!task.due_date) return false;
          const { start: weekStart, end: weekEnd } = getCurrentWeekBounds(today);
          return task.due_date.split('T')[0] >= weekStart && task.due_date.split('T')[0] < weekEnd;
        }
        case 'later':
          // "Mais pra frente" = next week and beyond
          if (!task.due_date || task.completed) return false;
          return task.due_date.split('T')[0] >= nextWeekStartStr;
        case 'noDate':
          return !task.due_date && !task.completed;
        case 'completed':
          return task.completed;
        default:
          return true;
      }
    });
  }, [visibleTasks, selectedList]);

  // Futuro view: compute next Monday (start of first future week)
  const nextMondayStr = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return getNextWeekBounds(today).start;
  }, []);

  // The Monday of the week currently being browsed in Futuro
  const activeFutureWeekStart = futureViewWeekStart ?? nextMondayStr;

  // Futuro view: 7 daily tabs for the active week, with per-day task counts
  const futureDayTabs = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(`${activeFutureWeekStart}T00:00:00`);
      day.setDate(day.getDate() + i);
      const dateStr = day.toISOString().split('T')[0];
      const abbrev = PT_DAY_ABBREV[day.getDay()];
      const count = filteredTasks.filter(
        (t) => t.due_date && t.due_date.split('T')[0] === dateStr,
      ).length;
      return { dateStr, label: `${abbrev} ${day.getDate()}`, count };
    });
  }, [activeFutureWeekStart, filteredTasks]);

  // Futuro view: tasks for the selected day
  const futureWeekTasks = useMemo(() => {
    const firstDayWithTasks = futureDayTabs.find((d) => d.count > 0)?.dateStr ?? futureDayTabs[0]?.dateStr;
    const activeDay = selectedFutureDay ?? firstDayWithTasks ?? null;
    if (!activeDay) return [];
    return filteredTasks.filter(
      (t) => t.due_date && t.due_date.split('T')[0] === activeDay,
    );
  }, [filteredTasks, selectedFutureDay, futureDayTabs]);

  // Week view: tasks grouped by each day (Mon–Sun) of the current week
  const weekViewData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    return getCurrentWeekDays(today).map((day) => {
      const dateStr = day.toISOString().split('T')[0];
      const abbrev = PT_DAY_ABBREV[day.getDay()];
      const label = `${abbrev}, ${day.getDate()}`;
      const isPast = dateStr < todayStr;

      const dayTasks = filteredTasks.filter(
        (t) => t.due_date && t.due_date.split('T')[0] === dateStr,
      );

      return { dateStr, label, isPast, tasks: dayTasks };
    });
  }, [filteredTasks]);

  // Categorization based on due dates (following Figma structure)
  const categorizedTasks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const { start: nextWeekStartStr, end: nextWeekEndStr } = getNextWeekBounds(today);
    const { start: currentWeekStartStr, end: currentWeekEndStr } = getCurrentWeekUpcomingBounds(today);

    const categories = {
      vencidas: [] as Task[],
      hoje: [] as Task[],
      amanha: [] as Task[],
      estaSemana: [] as Task[],
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
      } else if (taskDateStr >= currentWeekStartStr && taskDateStr < currentWeekEndStr) {
        categories.estaSemana.push(task);
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
          'esta-semana': 'estaSemana',
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

    const { start: nextWeekStartStr } = getNextWeekBounds(today);

    let todayCount = 0;
    let week = 0;   // Esta semana: today → end of this calendar week
    let later = 0;  // Mais pra frente: next week+
    let noDate = 0;
    let all = 0;

    tasks.forEach((task) => {
      if (task.completed) return;
      all += 1;

      if (!task.due_date) {
        noDate += 1;
        return;
      }

      const dateStr = task.due_date.split('T')[0];

      if (dateStr === todayStr) {
        todayCount += 1;
      } else if (dateStr > todayStr && dateStr < nextWeekStartStr) {
        week += 1;
      } else if (dateStr >= nextWeekStartStr) {
        later += 1;
      }
      // overdue tasks (dateStr < todayStr) are shown in the all-view but not
      // counted for the new simplified sidebar items.
    });

    return { all, today: todayCount, week, later, noDate };
  }, [tasks]);

  const handleListSelect = (listType: ListType) => {
    // Returning to the all-view: restore every section to its default open state
    if (listType === 'all') {
      setOpenSections(ALL_SECTIONS_OPEN);
    }
    setSelectedList(listType);
    setSelectedCustomListId(null);
    setSelectedCategoryName(null);
    setSelectedTask(null);
  };

  const handleCustomListSelect = (listId: string) => {
    setSelectedList('all');
    setSelectedCategoryName(null);
    setSelectedCustomListId((prev) => (prev === listId ? null : listId));
    setSelectedTask(null);
  };

  const handleCategorySelect = (categoryName: string) => {
    setSelectedList('all');
    setSelectedCustomListId(null);
    setSelectedCategoryName((prev) => (prev === categoryName ? null : categoryName));
    setSelectedTask(null);
  };

  const allSectionsExpanded = Object.entries(openSections)
    .filter(([key]) => key !== 'completadas')
    .every(([, value]) => value);

  const handleToggleAllSections = () => {
    const nextValue = !allSectionsExpanded;
    setOpenSections(prev =>
      Object.fromEntries(Object.keys(prev).map(k => [k, k === 'completadas' ? false : nextValue]))
    );
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

  // When a category or single-category custom list is active, pre-fill that
  // category in the ControlBar task creation form.
  const contextTaskCategory: string | undefined = useMemo(() => {
    if (selectedCategoryName) return selectedCategoryName;
    if (selectedCustomList?.category_names?.length === 1) return selectedCustomList.category_names[0];
    return undefined;
  }, [selectedCategoryName, selectedCustomList]);
  const isCustomListView = Boolean(selectedCustomList);
  const pageDescription = selectedCustomList?.description?.trim() || undefined;
  const toggleSectionsLabel = allSectionsExpanded ? 'Colapsar tudo' : 'Expandir tudo';
  const activeFilterCount = [
    activeFilters.priority,
    activeFilters.category.length > 0,
    activeFilters.connectedApp,
    !activeFilters.showCompleted,
  ].filter(Boolean).length;
  const hasFilters = activeFilterCount > 0;
  const filterLabel = hasFilters ? `Filtrar (${activeFilterCount})` : 'Filtrar';

  const filterButton = (
    <div ref={filterAnchorRef} style={{ display: 'inline-flex' }}>
      <Tooltip label={filterLabel} position="bottom" disabled={!isCompactHeader}>
        <Button
          type="button"
          variant="secondary"
          size="medium"
          icon={FunnelSimple}
          iconPosition={isCompactHeader ? 'icon-only' : 'left'}
          active={hasFilters || isFilterOpen}
          onClick={() => setIsFilterOpen((prev) => !prev)}
          aria-label={isCompactHeader ? filterLabel : undefined}
        >
          {!isCompactHeader && filterLabel}
        </Button>
      </Tooltip>
    </div>
  );

  const tableControls = (
    <>
      <Tooltip label="Apps" position="bottom" disabled={!isCompactHeader}>
        <Button
          type="button"
          variant="ghost"
          size="medium"
          icon={CirclesFour}
          iconPosition={isCompactHeader ? 'icon-only' : 'left'}
          aria-label={isCompactHeader ? 'Apps' : undefined}
          onClick={() => openSettingsRef.current?.('apps')}
        >
          {!isCompactHeader && 'Apps'}
        </Button>
      </Tooltip>
      <Tooltip label={toggleSectionsLabel} position="bottom">
        <Button
          type="button"
          variant="ghost"
          size="medium"
          icon={allSectionsExpanded ? ArrowsInLineVertical : ArrowsOutLineVertical}
          iconPosition="icon-only"
          aria-label={toggleSectionsLabel}
          onClick={handleToggleAllSections}
        />
      </Tooltip>
      {!isCustomListView && filterButton}
    </>
  );

  const headerActions = isCustomListView ? (
    <>
      {tableControls}
      <Button
        type="button"
        variant="secondary"
        size="medium"
        icon={Gear}
        iconPosition="left"
        onClick={() => setIsEditListOpen(true)}
      >
        Editar
      </Button>
    </>
  ) : tableControls;

  useEffect(() => {
    if (!selectedCustomListId) {
      setIsEditListOpen(false);
    }
  }, [selectedCustomListId]);

  // Keep custom list completed section collapsed on first load and when switching lists.
  useEffect(() => {
    setIsCustomListCompletedOpen(false);
  }, [selectedCustomListId]);

  const sidebarNode = (
    <>
      <Sidebar
        selectedList={selectedList}
        selectedCustomListId={selectedCustomListId}
        selectedCategory={selectedCategoryName}
        onListSelect={handleListSelect}
        onCustomListSelect={handleCustomListSelect}
        onCategorySelect={handleCategorySelect}
        addButtonRef={addListButtonRef}
        taskCounts={sidebarTaskCounts}
        categories={sidebarCategories}
        customLists={customLists.map((l) => ({ id: l.id, name: l.name }))}
        openSettingsRef={openSettingsRef}
        forceCollapsed={isChatOpen}
      />
      <FilterPopover
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        anchorRef={filterAnchorRef}
        filters={activeFilters}
        onFiltersChange={setActiveFilters}
        categoryOptions={popoverCategories.map((c) => ({ value: c.name, label: c.name }))}
        onListSaved={(listId: string) => {
          handleCustomListSelect(listId);
          setActiveFilters(DEFAULT_FILTER_STATE);
        }}
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
    const { start: currentWeekStartStr, end: currentWeekEndStr } = getCurrentWeekUpcomingBounds(today);
    
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
      case 'esta-semana':
        // Use the first available day after tomorrow still inside current week
        newDueDate = currentWeekStartStr < currentWeekEndStr ? currentWeekStartStr : tomorrowStr;
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

  const DroppableSection = useMemo<React.FC<{ 
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
    showDayOfWeek?: boolean;
    // onQuickCreate?: (title: string, sectionId: string) => Promise<void>; // NOT USED IN MVP INITIAL
  }>>(() => memo(({ 
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
    showDayOfWeek = false,
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
                      showDayOfWeek={showDayOfWeek}
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
  }), []);

  // Show task details in center when: task-mode chat is open, OR user opened a task from the list while chat was active
  const showTaskInCenter = isChatOpen && !!selectedTask && (chatMode === 'task' || expandedFromList);

  // Compute right sidebar content based on chat/task selection state.
  // Wrapped in AnimatePresence so swapping between task details and chat
  // plays a coordinated slide: details exits left, chat enters from right.
  const panelTransition = { duration: 0.32, ease: [0.4, 0, 0.2, 1] } as const;

  const computedRightSidebar = (isChatOpen || !!selectedTask || !!selectedPendingTask) ? (
    <AnimatePresence mode="wait" initial={false}>
      {isChatOpen ? (
        <motion.div
          key="chat-panel"
          style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}
          initial={{ opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 60 }}
          transition={panelTransition}
        >
          <AIChatPanel
            key={chatKey}
            mode={chatMode}
            taskId={chatMode === 'task' ? selectedTask?.id : undefined}
            taskTitle={chatMode === 'task' ? selectedTask?.title : undefined}
            onClose={handleCloseChat}
            onTaskMutated={handleChatTaskMutated}
            initialMessage={chatMode === 'general' ? chatInitialMessage : undefined}
            onTaskCardClick={handleChatTaskCardClick}
            onListCardClick={handleChatListCardClick}
            onCategoryCardClick={handleChatCategoryCardClick}
          />
        </motion.div>
      ) : selectedPendingTask ? (
        <motion.div
          key="pending-task-details-panel"
          style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}
          initial={{ opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -60 }}
          transition={panelTransition}
        >
          <PendingTaskDetailsSidebar
            task={selectedPendingTask}
            onClose={handlePendingTaskSidebarClose}
            onConfirm={handleConfirmPendingTask}
            onReject={handleRejectPendingTask}
          />
        </motion.div>
      ) : selectedTask ? (
        <motion.div
          key="task-details-panel"
          style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}
          initial={{ opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -60 }}
          transition={panelTransition}
        >
          <TaskDetailsSidebar
            isOpen={true}
            task={selectedTask}
            onClose={handleDialogClose}
            onUpdateTask={handleUpdateTask}
            onToggleCompletion={handleToggleCompletion}
            onDelete={handleDeleteTask}
            onOpenChat={handleOpenChatFromTask}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  ) : undefined;

  // Task details rendered in the center column when chat is open alongside a task.
  // Slides in from the right to create the illusion of "moving" from the right panel.
  const taskDetailsInCenter = showTaskInCenter ? (
    <motion.div
      key="task-details-center"
      style={{ width: '100%', height: '100%' }}
      initial={{ opacity: 0, x: '18%' }}
      animate={{ opacity: 1, x: 0 }}
      transition={panelTransition}
    >
      <TaskDetailsSidebar
        isOpen={true}
        task={selectedTask}
        onClose={handleTaskDetailsCenterClose}
        onUpdateTask={handleUpdateTask}
        onToggleCompletion={handleToggleCompletion}
        onDelete={handleDeleteTask}
        onOpenChat={handleOpenChatFromTask}
        variant="expanded"
        showBackButton={expandedFromList}
      />
    </motion.div>
  ) : null;

  if (isLoading) {
    return (
      <MainLayout
        sidebar={sidebarNode}
        title={pageTitle}
        titleVariant="heading"
        titleDescription={pageDescription}
        headerActions={headerActions}
        onCreateTask={handleControlBarCreateTask}
        rightSidebar={computedRightSidebar}
        onOpenChat={handleOpenChatGeneral}
        onSubmitPrompt={handleOpenChatGeneral}
        hideControlBar={isChatOpen}
        hideHeader={showTaskInCenter}
        mainBodyRef={mainBodyRef}
        defaultTaskCategory={contextTaskCategory}
      >
        {showTaskInCenter ? taskDetailsInCenter : <div className={styles.loading}>Carregando tarefas...</div>}
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout
        sidebar={sidebarNode}
        title={pageTitle}
        titleVariant="heading"
        titleDescription={pageDescription}
        headerActions={headerActions}
        onCreateTask={handleControlBarCreateTask}
        rightSidebar={computedRightSidebar}
        onOpenChat={handleOpenChatGeneral}
        onSubmitPrompt={handleOpenChatGeneral}
        hideControlBar={isChatOpen}
        hideHeader={showTaskInCenter}
        mainBodyRef={mainBodyRef}
        defaultTaskCategory={contextTaskCategory}
      >
        {showTaskInCenter ? taskDetailsInCenter : <div className={styles.error}>Erro: {error}</div>}
      </MainLayout>
    );
  }

  // "Esta semana" view: collapsible sections grouped by each day of the current week
  if (selectedList === 'week' && !selectedCustomListId) {
    return (
      <MainLayout
        sidebar={sidebarNode}
        title={pageTitle}
        titleVariant="heading"
        titleDescription={pageDescription}
        headerActions={headerActions}
        onCreateTask={handleControlBarCreateTask}
        rightSidebar={computedRightSidebar}
        onOpenChat={handleOpenChatGeneral}
        onSubmitPrompt={handleOpenChatGeneral}
        hideControlBar={isChatOpen}
        hideHeader={showTaskInCenter}
        mainBodyRef={mainBodyRef}
        defaultTaskCategory={contextTaskCategory}
      >
        {showTaskInCenter ? taskDetailsInCenter : (
          <div className={styles.content}>
            {weekViewData.map(({ dateStr, label, isPast, tasks: dayTasks }) => {
              const isOpen = weekSectionOpen[dateStr] ?? true;
              return (
                <Collapsible
                  key={dateStr}
                  label={label}
                  defaultOpen={true}
                  isOpen={isOpen}
                  onOpenChange={(open) =>
                    setWeekSectionOpen((prev) => ({ ...prev, [dateStr]: open }))
                  }
                  isPast={isPast}
                  disabled={dayTasks.length === 0}
                >
                  <div className={styles.sectionContent}>
                    {dayTasks.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        section="week"
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
                    ))}
                  </div>
                </Collapsible>
              );
            })}
          </div>
        )}
      </MainLayout>
    );
  }

  // "Futuro" view: tasks from next week onward, with daily tabs per week
  if (selectedList === 'later' && !selectedCustomListId) {
    const firstDayWithTasks = futureDayTabs.find((d) => d.count > 0)?.dateStr ?? futureDayTabs[0]?.dateStr;
    const activeDay = selectedFutureDay ?? firstDayWithTasks ?? null;

    const handlePrevWeek = () => {
      const prev = new Date(`${activeFutureWeekStart}T00:00:00`);
      prev.setDate(prev.getDate() - 7);
      const prevStr = prev.toISOString().split('T')[0];
      // Don't go before next Monday from today
      if (prevStr >= nextMondayStr) {
        setFutureViewWeekStart(prevStr);
        setSelectedFutureDay(null);
      }
    };

    const handleNextWeek = () => {
      const next = new Date(`${activeFutureWeekStart}T00:00:00`);
      next.setDate(next.getDate() + 7);
      setFutureViewWeekStart(next.toISOString().split('T')[0]);
      setSelectedFutureDay(null);
    };

    const handleTodayWeek = () => {
      setFutureViewWeekStart(null);
      setSelectedFutureDay(null);
    };

    const weekNavigator = (
      <WeekNavigator
        weekStart={activeFutureWeekStart}
        onPrev={handlePrevWeek}
        onNext={handleNextWeek}
        onToday={handleTodayWeek}
        isCurrentWeek={activeFutureWeekStart === nextMondayStr}
      />
    );

    return (
      <MainLayout
        sidebar={sidebarNode}
        title={pageTitle}
        titleVariant="heading"
        titleDescription={pageDescription}
        titleSuffix={weekNavigator}
        headerActions={headerActions}
        onCreateTask={handleControlBarCreateTask}
        rightSidebar={computedRightSidebar}
        onOpenChat={handleOpenChatGeneral}
        onSubmitPrompt={handleOpenChatGeneral}
        hideControlBar={isChatOpen}
        hideHeader={showTaskInCenter}
        mainBodyRef={mainBodyRef}
        defaultTaskCategory={contextTaskCategory}
      >
        {showTaskInCenter ? taskDetailsInCenter : (
          <div className={styles.content}>
            <nav className={styles.futureWeekNav} aria-label="Dias da semana">
              {futureDayTabs.map(({ dateStr, label, count }) => (
                <CalendarListItem
                  key={dateStr}
                  label={label}
                  count={count}
                  state={dateStr === activeDay ? 'active' : 'default'}
                  onClick={() => setSelectedFutureDay(dateStr)}
                />
              ))}
            </nav>

            <div className={styles.sectionContent}>
              {futureWeekTasks.length > 0 ? (
                futureWeekTasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    section="later"
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
                <TaskEmptyState
                  title="Nada por aqui ainda"
                  description="Nenhuma tarefa para este dia"
                />
              )}
            </div>
          </div>
        )}
      </MainLayout>
    );
  }

  // If a specific list or category is selected (not "all"), show simple list without Collapsible
  if (selectedList !== 'all' || selectedCustomListId || selectedCategoryName) {
    const simpleViewTasks = (selectedCustomListId || selectedCategoryName) ? visibleTasks : filteredTasks;
    const simpleViewSection = selectedCustomListId ? 'custom-list' : selectedCategoryName ? 'category' : selectedList;
    const incompleteSimpleViewTasks = (selectedCustomListId || selectedCategoryName)
      ? simpleViewTasks.filter((task) => !task.completed)
      : simpleViewTasks;
    const completedSimpleViewTasks = (selectedCustomListId || selectedCategoryName)
      ? simpleViewTasks.filter((task) => task.completed)
      : [];

    return (
      <MainLayout
        sidebar={sidebarNode}
        title={pageTitle}
        titleVariant="heading"
        titleDescription={pageDescription}
        headerActions={headerActions}
        onCreateTask={handleControlBarCreateTask}
        rightSidebar={computedRightSidebar}
        onOpenChat={handleOpenChatGeneral}
        onSubmitPrompt={handleOpenChatGeneral}
        hideControlBar={isChatOpen}
        hideHeader={showTaskInCenter}
        mainBodyRef={mainBodyRef}
        defaultTaskCategory={contextTaskCategory}
      >
        {showTaskInCenter ? taskDetailsInCenter : <div className={styles.content}>
          <div className={styles.sectionContent}>
            {incompleteSimpleViewTasks.length > 0 ? (
              incompleteSimpleViewTasks.map((task) => (
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
              <TaskEmptyState
                title="Nada por aqui ainda"
                description={
                  selectedCategoryName
                    ? 'Use categorias para filtrar, priorizar e visualizar melhor o que importa.'
                    : 'Nenhuma tarefa encontrada nesta lista.'
                }
              />
            )}
          </div>

          {selectedCustomListId && completedSimpleViewTasks.length > 0 && (
            <Collapsible
              label="Tarefas concluídas"
              defaultOpen={false}
              isOpen={isCustomListCompletedOpen}
              onOpenChange={setIsCustomListCompletedOpen}
            >
              <div className={styles.sectionContent}>
                {completedSimpleViewTasks.map((task) => (
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
                ))}
              </div>
            </Collapsible>
          )}
        </div>}
      </MainLayout>
    );
  }

  // Default view: "all" selected - show categorized tasks with Collapsible
  return (
    <MainLayout
      sidebar={sidebarNode}
      title={pageTitle}
        titleVariant="heading"
        titleDescription={pageDescription}
        headerActions={headerActions}
        onCreateTask={handleControlBarCreateTask}
        onOpenTaskDetails={handleTaskClick}
        rightSidebar={computedRightSidebar}
        onOpenChat={handleOpenChatGeneral}
        onSubmitPrompt={handleOpenChatGeneral}
        hideControlBar={isChatOpen}
        hideHeader={showTaskInCenter}
        mainBodyRef={mainBodyRef}
        defaultTaskCategory={contextTaskCategory}
      >
      {showTaskInCenter ? taskDetailsInCenter : <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className={styles.content}>
          {visibleTasks.length === 0 && pendingTasks.length === 0 && !isPendingTasksLoading && (
            <TaskEmptyState
              title="Nada por aqui ainda"
              description="Crie sua primeira tarefa para começar a organizar seu dia."
            />
          )}
          {(isPendingTasksLoading || pendingTasksError || pendingTasks.length > 0) && (
            <Collapsible
              label={pendingTasks.length > 0 ? `Integrações (${pendingTasks.length})` : 'Integrações'}
              defaultOpen={true}
              isOpen={openSections.integracoes}
              onOpenChange={(isOpen) => setOpenSections(prev => ({ ...prev, integracoes: isOpen }))}
            >
              <div className={styles.sectionContent}>
                {isPendingTasksLoading && (
                  <p className={styles.pendingSectionMessage}>Carregando sugestões...</p>
                )}

                {pendingTasksError && (
                  <p className={styles.pendingSectionError}>{pendingTasksError}</p>
                )}

                {pendingTasks.length > 0 && (
                  <div className={styles.pendingTaskList}>
                    {pendingTasks.map((pendingTask) => (
                      <PendingTaskCard
                        key={pendingTask.id}
                        task={pendingTask}
                        onConfirm={handleConfirmPendingTask}
                        onReject={handleRejectPendingTask}
                        onUpdate={handleUpdatePendingTask}
                        onClick={handlePendingTaskClick}
                        isActive={selectedPendingTask?.id === pendingTask.id}
                      />
                    ))}
                  </div>
                )}
              </div>
            </Collapsible>
          )}

          {/* ── Section anchors: only rendered when there are tasks to show ── */}
          {visibleTasks.length > 0 && <>

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
          />

          {/* Esta semana (restante) */}
          <DroppableSection
            title="Ainda esta semana"
            tasks={categorizedTasks.estaSemana}
            emptyMessage="Nenhuma tarefa para esta semana"
            sectionId="esta-semana"
            defaultOpen={true}
            isOpen={openSections['esta-semana']}
            onOpenChange={(isOpen) => setOpenSections(prev => ({ ...prev, 'esta-semana': isOpen }))}
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
            showDayOfWeek={true}
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
          />

          {/* Mais pra Frente */}
          {categorizedTasks.eventosFuturos.length > 0 && (
            <DroppableSection
              title="Futuro"
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

          </>}
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
      </DndContext>}
    </MainLayout>
  );
}

