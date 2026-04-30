import { useMemo, useState, useRef, useEffect, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { CaretLeft, CaretRight, FireSimple, PencilSimple, Plus, Trash, WhatsappLogo } from '@phosphor-icons/react';
import type { Task } from '../../../../contexts/TaskContext';
import { Button, Chip } from '../../../ui';
import { TaskCheckbox } from '../TaskCheckbox';
import styles from './CalendarView.module.css';

type CalendarViewMode = 'week' | 'month';

export interface CalendarViewProps {
  tasks: Task[];
  undatedTasks: Task[];
  view: CalendarViewMode;
  anchorDate: string;
  selectedTaskId?: string | null;
  onViewChange: (view: CalendarViewMode) => void;
  onAnchorDateChange: (date: string) => void;
  onTaskClick: (task: Task) => void;
  onToggleCompletion: (taskId: string) => void;
  onUpdateTask: (taskId: string, taskData: any, showLoading?: boolean) => Promise<void>;
  onCreateTask?: (title: string, dueDate?: string) => Promise<void>;
  onDeleteTask?: (taskId: string) => void;
}

const PT_MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

const PT_WEEKDAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const;
const PT_WEEKDAY_LONG = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'] as const;

function parseDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00`);
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTaskDateKey(task: Task): string | null {
  return task.due_date ? task.due_date.split('T')[0] : null;
}

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const dayOfWeek = result.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  result.setDate(result.getDate() - daysFromMonday);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months, 1);
  return result;
}

function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

function formatMonthYear(date: Date): string {
  return `${PT_MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

function formatDayTitle(date: Date): string {
  return `${date.getDate()} ${PT_MONTH_NAMES[date.getMonth()]}`;
}

function formatWeekTitle(days: Date[]): string {
  const first = days[0];

  return `${PT_MONTH_NAMES[first.getMonth()]} ${first.getFullYear()}`;
}

function buildMonthDays(anchorDate: Date): Date[] {
  const firstOfMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const lastOfMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
  const start = startOfWeek(firstOfMonth);
  const end = addDays(startOfWeek(addDays(lastOfMonth, 6)), 6);
  const days: Date[] = [];

  for (let day = new Date(start); day <= end; day = addDays(day, 1)) {
    days.push(day);
  }

  return days;
}

function sortCalendarTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const aHasTime = !!a.time;
    const bHasTime = !!b.time;
    if (aHasTime && !bHasTime) return -1;
    if (!aHasTime && bHasTime) return 1;
    if (aHasTime && bHasTime) return a.time!.localeCompare(b.time!);
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

function CalendarEmptySlot({
  slotKey,
  dateKey,
  isHovered,
  isEditing,
  onMouseEnter,
  onMouseLeave,
  onActivate,
  onDeactivate,
  onCreateTask,
}: {
  slotKey: string;
  dateKey: string | null;
  isHovered: boolean;
  isEditing: boolean;
  onMouseEnter: (key: string) => void;
  onMouseLeave: () => void;
  onActivate: (key: string) => void;
  onDeactivate: () => void;
  onCreateTask?: (title: string, dueDate?: string) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    if (!onCreateTask) return;
    onActivate(slotKey);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !onCreateTask) { onDeactivate(); return; }
    await onCreateTask(title.trim(), dateKey ?? undefined);
    setTitle('');
    onDeactivate();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { setTitle(''); onDeactivate(); }
  };

  if (isEditing) {
    return (
      <form className={styles.inlineCreate} onSubmit={(e) => void handleSubmit(e)}>
        <Plus size={14} className={styles.inlineCreateIcon} aria-hidden />
        <input
          ref={inputRef}
          className={styles.inlineCreateInput}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={async () => {
              if (title.trim() && onCreateTask) {
                await onCreateTask(title.trim(), dateKey ?? undefined);
                setTitle('');
                onDeactivate();
              } else {
                setTitle('');
                onDeactivate();
              }
            }}
          placeholder="Nova tarefa..."
        />
      </form>
    );
  }

  return (
    <div
      className={`${styles.emptySlot} ${isHovered && onCreateTask ? styles.emptySlotHovered : ''}`}
      onMouseEnter={() => onMouseEnter(slotKey)}
      onMouseLeave={onMouseLeave}
      onClick={handleClick}
    >
      {isHovered && onCreateTask && (
        <span className={styles.emptySlotHint}>
          <Plus size={13} aria-hidden /> Nova tarefa
        </span>
      )}
    </div>
  );
}

function MonthCellCreate({
  dateKey,
  onCreateTask,
  onDeactivate,
}: {
  dateKey: string;
  onCreateTask?: (title: string, dueDate?: string) => Promise<void>;
  onDeactivate: () => void;
}) {
  const [title, setTitle] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !onCreateTask) { onDeactivate(); return; }
    await onCreateTask(title.trim(), dateKey);
    setTitle('');
    onDeactivate();
  };

  return (
    <form className={styles.monthInlineCreate} onSubmit={(e) => void handleSubmit(e)}>
      <Plus size={12} className={styles.inlineCreateIcon} aria-hidden />
      <input
        autoFocus
        className={styles.monthInlineCreateInput}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { setTitle(''); onDeactivate(); } }}
        onBlur={async () => {
          if (title.trim() && onCreateTask) {
            await onCreateTask(title.trim(), dateKey);
          }
          setTitle('');
          onDeactivate();
        }}
        placeholder="Nova tarefa..."
      />
    </form>
  );
}

function CalendarTaskPill({
  task,
  selected,
  compact = false,
  card = false,
  isDragging = false,
  onTaskClick,
  onToggleCompletion,
  onDelete,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  selected: boolean;
  compact?: boolean;
  card?: boolean;
  isDragging?: boolean;
  onTaskClick: (task: Task) => void;
  onToggleCompletion: (taskId: string) => void;
  onDelete?: (taskId: string) => void;
  onDragStart: (task: Task) => void;
  onDragEnd: () => void;
}) {
  const classes = [
    styles.taskPill,
    compact && styles.taskPillCompact,
    card && styles.taskPillCard,
    selected && styles.taskPillSelected,
    task.completed && styles.taskPillCompleted,
    isDragging && styles.taskPillDragging,
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      role="button"
      tabIndex={0}
      draggable
      onClick={() => onTaskClick(task)}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', task.id);
        onDragStart(task);
      }}
      onDragEnd={onDragEnd}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onTaskClick(task);
        }
      }}
    >
      <TaskCheckbox
        checked={task.completed}
        onChange={() => onToggleCompletion(task.id)}
        ariaLabel={task.completed ? 'Marcar como não concluída' : 'Marcar como concluída'}
        className={styles.calendarCheckbox}
      />
      <span className={styles.taskTitle}>{task.title}</span>
      <div className={styles.taskActions}>
        <button
          className={styles.taskActionBtn}
          title="Editar tarefa"
          onClick={(e) => { e.stopPropagation(); onTaskClick(task); }}
        >
          <PencilSimple size={14} />
        </button>
        {onDelete && (
          <button
            className={styles.taskActionBtn}
            title="Deletar tarefa"
            onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
          >
            <Trash size={14} />
          </button>
        )}
      </div>
      {task.original_whatsapp_content ? (
        <WhatsappLogo
          weight="fill"
          className={styles.whatsappIcon}
          aria-hidden="true"
        />
      ) : task.priority && (
        <FireSimple
          weight="fill"
          className={`${styles.priorityIcon} ${task.completed ? styles.priorityIconDisabled : ''}`}
          aria-hidden="true"
        />
      )}
      {task.time && (
        <Chip label={task.time} size="small" chipStyle="outline" className={styles.taskTimeChip} />
      )}
    </div>
  );
}

export function CalendarView({
  tasks,
  undatedTasks,
  view,
  anchorDate,
  selectedTaskId,
  onViewChange,
  onAnchorDateChange,
  onTaskClick,
  onToggleCompletion,
  onUpdateTask,
  onCreateTask,
  onDeleteTask,
}: CalendarViewProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const [activeSlotKey, setActiveSlotKey] = useState<string | null>(null);
  const [hoveredSlotKey, setHoveredSlotKey] = useState<string | null>(null);
  const [overflowPopoverKey, setOverflowPopoverKey] = useState<string | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<DOMRect | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);
  const parsedAnchorDate = useMemo(() => parseDateKey(anchorDate), [anchorDate]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(parsedAnchorDate), index)),
    [parsedAnchorDate],
  );
  const monthDays = useMemo(() => buildMonthDays(parsedAnchorDate), [parsedAnchorDate]);
  const tasksByDate = useMemo(() => {
    const grouped = new Map<string, Task[]>();

    tasks.forEach((task) => {
      const dateKey = getTaskDateKey(task);
      if (!dateKey) return;
      const group = grouped.get(dateKey) ?? [];
      group.push(task);
      grouped.set(dateKey, group);
    });

    grouped.forEach((group, dateKey) => {
      grouped.set(dateKey, sortCalendarTasks(group));
    });

    return grouped;
  }, [tasks]);

  const activeTitle = view === 'week' ? formatWeekTitle(weekDays) : formatMonthYear(parsedAnchorDate);

  const handlePrevious = () => {
    const nextDate = view === 'week'
      ? addDays(parsedAnchorDate, -7)
      : addMonths(parsedAnchorDate, -1);
    onAnchorDateChange(toDateKey(nextDate));
  };

  const handleNext = () => {
    const nextDate = view === 'week'
      ? addDays(parsedAnchorDate, 7)
      : addMonths(parsedAnchorDate, 1);
    onAnchorDateChange(toDateKey(nextDate));
  };

  const handleToday = () => {
    onAnchorDateChange(toDateKey(today));
  };

  useEffect(() => {
    if (!overflowPopoverKey) return;
    const handleOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOverflowPopoverKey(null);
        setPopoverAnchor(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOverflowPopoverKey(null); setPopoverAnchor(null); }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [overflowPopoverKey]);

  const handleOverflowClick = (e: React.MouseEvent, dateKey: string) => {
    e.stopPropagation();
    if (overflowPopoverKey === dateKey) {
      setOverflowPopoverKey(null);
      setPopoverAnchor(null);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setOverflowPopoverKey(dateKey);
    setPopoverAnchor(rect);
  };

  const allCalendarTasks = useMemo(() => [...tasks, ...undatedTasks], [tasks, undatedTasks]);

  const handleMoveTask = async (taskId: string, dueDate?: string) => {
    const task = allCalendarTasks.find((item) => item.id === taskId);
    if (!task) return;

    const currentDate = getTaskDateKey(task);
    if ((currentDate ?? undefined) === dueDate) return;

    await onUpdateTask(task.id, {
      title: task.title,
      description: task.description,
      priority: task.priority,
      category: task.category,
      completed: task.completed,
      dueDate,
      time: task.time,
    }, false);
  };

  const getDraggedTaskId = (event: DragEvent) =>
    event.dataTransfer.getData('text/plain') || draggedTaskId;

  const handleDropOnDate = async (event: DragEvent, dateKey: string) => {
    event.preventDefault();
    setDropTargetKey(null);
    const taskId = getDraggedTaskId(event);
    if (taskId) {
      await handleMoveTask(taskId, dateKey);
    }
  };

  const handleDropOnUndated = async (event: DragEvent) => {
    event.preventDefault();
    setDropTargetKey(null);
    const taskId = getDraggedTaskId(event);
    if (taskId) {
      await handleMoveTask(taskId, undefined);
    }
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDropTargetKey(null);
  };

  const renderWeekDayColumn = (day: Date, weekdayLabel: string, totalSlots: number) => {
    const dateKey = toDateKey(day);
    const dayTasks = tasksByDate.get(dateKey) ?? [];
    const isToday = isSameDay(day, today);
    const emptySlots = Math.max(0, totalSlots - dayTasks.length);

    return (
      <div
        key={dateKey}
        className={[
          styles.weekColumn,
          isToday && styles.todayColumn,
          dropTargetKey === `date-${dateKey}` && styles.dropTarget,
        ].filter(Boolean).join(' ')}
        onDragEnter={() => setDropTargetKey(`date-${dateKey}`)}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setDropTargetKey(`date-${dateKey}`);
        }}
        onDragLeave={() => setDropTargetKey(null)}
        onDrop={(event) => void handleDropOnDate(event, dateKey)}
      >
        <div className={`${styles.weekDayHeader} ${isToday ? styles.weekDayHeaderActive : ''}`}>
          <span className={styles.weekDayNumber}>{formatDayTitle(day)}</span>
          <span className={styles.weekDayName}>{weekdayLabel}</span>
        </div>
        <div className={styles.weekDayTasks}>
          {dayTasks.map((task) => (
            <CalendarTaskPill
              key={task.id}
              task={task}
              selected={selectedTaskId === task.id}
              isDragging={draggedTaskId === task.id}
              onTaskClick={onTaskClick}
              onToggleCompletion={onToggleCompletion}
              onDelete={onDeleteTask}
              onDragStart={(dragTask) => setDraggedTaskId(dragTask.id)}
              onDragEnd={handleDragEnd}
            />
          ))}
          {Array.from({ length: emptySlots }).map((_, index) => (
            <CalendarEmptySlot
                key={`empty-${dateKey}-${index}`}
                slotKey={`empty-${dateKey}-${index}`}
                dateKey={dateKey}
                isHovered={hoveredSlotKey === `empty-${dateKey}-${index}`}
                isEditing={activeSlotKey === `empty-${dateKey}-${index}`}
                onMouseEnter={setHoveredSlotKey}
                onMouseLeave={() => setHoveredSlotKey(null)}
                onActivate={setActiveSlotKey}
                onDeactivate={() => setActiveSlotKey(null)}
                onCreateTask={onCreateTask}
              />
          ))}
        </div>
      </div>
    );
  };

  return (
    <section className={styles.root} aria-label="Calendário de tarefas">
      <div className={styles.toolbar}>
        <div className={styles.periodControls}>
          <div className={styles.navControls}>
            <Button
              type="button"
              variant="ghost"
              size="small"
              icon={CaretLeft}
              iconPosition="icon-only"
              aria-label={view === 'week' ? 'Semana anterior' : 'Mês anterior'}
              onClick={handlePrevious}
            />
            <Button
              type="button"
              variant="ghost"
              size="small"
              icon={CaretRight}
              iconPosition="icon-only"
              aria-label={view === 'week' ? 'Próxima semana' : 'Próximo mês'}
              onClick={handleNext}
            />
          </div>
          <div className={styles.todayTitleGroup}>
            <Button
              type="button"
              variant="secondary"
              size="small"
              className={styles.todayButton}
              onClick={handleToday}
            >
              Hoje
            </Button>
            <h2 className={styles.title}>{activeTitle}</h2>
          </div>
        </div>

        <div className={styles.toolbarActions}>
          <div className={styles.viewSwitch} aria-label="Alternar visualização">
            <Button
              type="button"
              variant="ghost"
              size="small"
              className={styles.viewSwitchButton}
              active={view === 'week'}
              onClick={() => onViewChange('week')}
            >
              Semana
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="small"
              className={styles.viewSwitchButton}
              active={view === 'month'}
              onClick={() => onViewChange('month')}
            >
              Mês
            </Button>
          </div>
        </div>
      </div>

      {view === 'week' ? (
        <div className={styles.weekSurface}>
          <div className={styles.weekSurfaceInner}>
          {/* Section 1: Monday – Friday */}
          <div className={styles.weekGrid}>
            {(() => {
              const weekdayTaskCounts = weekDays.slice(0, 5).map(
                (d) => (tasksByDate.get(toDateKey(d)) ?? []).length,
              );
              const weekdaySlots = Math.max(5, Math.max(...weekdayTaskCounts) + 1);
              return weekDays.slice(0, 5).map((day, index) =>
                renderWeekDayColumn(day, PT_WEEKDAY_LONG[index], weekdaySlots),
              );
            })()}
          </div>

          {/* Section 2: Saturday | Sunday | Sem data ×2 */}
          {(() => {
            const satTasks = tasksByDate.get(toDateKey(weekDays[5])) ?? [];
            const sunTasks = tasksByDate.get(toDateKey(weekDays[6])) ?? [];
            const undatedSlots = Math.ceil((undatedTasks.length + 1) / 2);
            const bottomSlots = Math.max(
              5,
              satTasks.length + 1,
              sunTasks.length + 1,
              undatedSlots,
            );
            const undatedCol0 = undatedTasks.slice(0, bottomSlots);
            const undatedCol1 = undatedTasks.slice(bottomSlots, bottomSlots * 2);
            const renderSomedayCol = (colTasks: typeof undatedTasks, colIndex: number) => {
              const emptyCount = Math.max(0, bottomSlots - colTasks.length);
              return (
                <div key={`someday-col-${colIndex}`} className={styles.somedayColumn}>
                  <div className={styles.weekDayTasks}>
                    {colTasks.map((task) => (
                      <CalendarTaskPill
                        key={task.id}
                        task={task}
                        selected={selectedTaskId === task.id}
                        compact
                        isDragging={draggedTaskId === task.id}
                        onTaskClick={onTaskClick}
                        onToggleCompletion={onToggleCompletion}
                        onDelete={onDeleteTask}
                        onDragStart={(dragTask) => setDraggedTaskId(dragTask.id)}
                        onDragEnd={handleDragEnd}
                      />
                    ))}
                    {Array.from({ length: emptyCount }).map((_, i) => (
                      <CalendarEmptySlot
                        key={`someday-empty-${colIndex}-${i}`}
                        slotKey={`someday-empty-${colIndex}-${i}`}
                        dateKey={null}
                        isHovered={hoveredSlotKey === `someday-empty-${colIndex}-${i}`}
                        isEditing={activeSlotKey === `someday-empty-${colIndex}-${i}`}
                        onMouseEnter={setHoveredSlotKey}
                        onMouseLeave={() => setHoveredSlotKey(null)}
                        onActivate={setActiveSlotKey}
                        onDeactivate={() => setActiveSlotKey(null)}
                        onCreateTask={onCreateTask}
                      />
                    ))}
                  </div>
                </div>
              );
            };
            return (
              <div
                className={`${styles.bottomGrid} ${dropTargetKey === 'undated' ? styles.dropTarget : ''}`}
                onDragEnter={() => setDropTargetKey('undated')}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setDropTargetKey('undated');
                }}
                onDragLeave={() => setDropTargetKey(null)}
                onDrop={(event) => void handleDropOnUndated(event)}
              >
                {renderWeekDayColumn(weekDays[5], PT_WEEKDAY_LONG[5], bottomSlots)}
                {renderWeekDayColumn(weekDays[6], PT_WEEKDAY_LONG[6], bottomSlots)}
                <div className={styles.somedaySection}>
                  <div className={styles.weekDayHeader}>
                    <span className={styles.weekDayNumber}>Sem data</span>
                  </div>
                  <div className={styles.somedayInnerGrid}>
                    {renderSomedayCol(undatedCol0, 0)}
                    {renderSomedayCol(undatedCol1, 1)}
                  </div>
                </div>
              </div>
            );
          })()}
          </div>
        </div>
      ) : (
        <div
          className={styles.monthSurface}
          onScroll={() => { setOverflowPopoverKey(null); setPopoverAnchor(null); }}
        >
          <div className={styles.monthWeekdays}>
            {PT_WEEKDAY_SHORT.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>

          <div className={styles.monthGrid}>
            {monthDays.map((day) => {
              const dateKey = toDateKey(day);
              const dayTasks = tasksByDate.get(dateKey) ?? [];
              const visibleTasks = dayTasks.slice(0, 3);
              const hiddenCount = dayTasks.length - visibleTasks.length;
              const isCurrentMonth = day.getMonth() === parsedAnchorDate.getMonth();
              const isToday = isSameDay(day, today);
              const cellSlotKey = `month-${dateKey}`;
              const isCellHovered = hoveredSlotKey === cellSlotKey;
              const isCellEditing = activeSlotKey === cellSlotKey;

              return (
                <div
                  key={dateKey}
                  className={[
                    styles.monthCell,
                    !isCurrentMonth && styles.monthCellMuted,
                    isToday && styles.monthCellToday,
                    dropTargetKey === `date-${dateKey}` && styles.dropTarget,
                  ].filter(Boolean).join(' ')}
                  onMouseEnter={() => setHoveredSlotKey(cellSlotKey)}
                  onMouseLeave={() => setHoveredSlotKey(null)}
                  onDragEnter={() => setDropTargetKey(`date-${dateKey}`)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    setDropTargetKey(`date-${dateKey}`);
                  }}
                  onDragLeave={() => setDropTargetKey(null)}
                  onDrop={(event) => void handleDropOnDate(event, dateKey)}
                >
                  <div className={styles.monthTasks}>
                    {isCellEditing ? (
                      <MonthCellCreate
                        dateKey={dateKey}
                        onCreateTask={onCreateTask}
                        onDeactivate={() => setActiveSlotKey(null)}
                      />
                    ) : onCreateTask ? (
                      <button
                        type="button"
                        className={`${styles.monthAddBtn} ${!isCellHovered ? styles.monthAddBtnIdle : ''}`}
                        onClick={() => setActiveSlotKey(cellSlotKey)}
                      >
                        <Plus size={12} aria-hidden />
                      </button>
                    ) : null}

                    {visibleTasks.map((task) => (
                      <CalendarTaskPill
                        key={task.id}
                        task={task}
                        selected={selectedTaskId === task.id}
                        compact
                        card
                        isDragging={draggedTaskId === task.id}
                        onTaskClick={onTaskClick}
                        onToggleCompletion={onToggleCompletion}
                        onDelete={onDeleteTask}
                        onDragStart={(dragTask) => setDraggedTaskId(dragTask.id)}
                        onDragEnd={handleDragEnd}
                      />
                    ))}
                  </div>

                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      className={`${styles.moreButton} ${overflowPopoverKey === dateKey ? styles.moreButtonActive : ''}`}
                      onClick={(e) => handleOverflowClick(e, dateKey)}
                    >
                      +{hiddenCount} tarefas
                    </button>
                  )}

                  <span className={styles.monthDayNumber}>{day.getDate()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {overflowPopoverKey && popoverAnchor && createPortal(
        <div
          ref={popoverRef}
          className={styles.overflowPopover}
          style={{
            top: popoverAnchor.bottom + 6,
            left: popoverAnchor.left,
            minWidth: Math.max(220, popoverAnchor.width + 60),
          }}
        >
          {(tasksByDate.get(overflowPopoverKey) ?? []).map((task) => (
            <CalendarTaskPill
              key={task.id}
              task={task}
              selected={selectedTaskId === task.id}
              compact
              card
              isDragging={draggedTaskId === task.id}
              onTaskClick={(t) => { onTaskClick(t); setOverflowPopoverKey(null); }}
              onToggleCompletion={onToggleCompletion}
              onDelete={onDeleteTask}
              onDragStart={(dragTask) => setDraggedTaskId(dragTask.id)}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>,
        document.body,
      )}
    </section>
  );
}
