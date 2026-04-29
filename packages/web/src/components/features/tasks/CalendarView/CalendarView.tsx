import { useMemo, useState, useRef, type DragEvent } from 'react';
import { CaretLeft, CaretRight, CirclesFour, FireSimple, PencilSimple, Plus, Trash, WhatsappLogo } from '@phosphor-icons/react';
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
  onAppsClick?: () => void;
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
  return PT_MONTH_NAMES[date.getMonth()];
}

function formatDayTitle(date: Date): string {
  return `${date.getDate()} ${PT_MONTH_NAMES[date.getMonth()]}`;
}

function formatWeekTitle(days: Date[]): string {
  const first = days[0];

  return PT_MONTH_NAMES[first.getMonth()];
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

function CalendarTaskPill({
  task,
  selected,
  compact = false,
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
  onAppsClick,
}: CalendarViewProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const [activeSlotKey, setActiveSlotKey] = useState<string | null>(null);
  const [hoveredSlotKey, setHoveredSlotKey] = useState<string | null>(null);
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

  const handleOverflowClick = (date: Date) => {
    onAnchorDateChange(toDateKey(date));
    onViewChange('week');
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

  const renderWeekDayColumn = (day: Date, weekdayLabel: string, compact = false) => {
    const dateKey = toDateKey(day);
    const dayTasks = tasksByDate.get(dateKey) ?? [];
    const isToday = isSameDay(day, today);

    let totalSlots: number;
    if (compact) {
      totalSlots = Math.max(3, dayTasks.length + 1);
    } else {
      const maxWeekdayTasks = Math.max(
        ...weekDays.slice(0, 5).map((d) => (tasksByDate.get(toDateKey(d)) ?? []).length),
      );
      totalSlots = Math.max(8, maxWeekdayTasks + 1);
    }

    const emptySlots = Math.max(0, totalSlots - dayTasks.length);

    return (
      <div
        key={dateKey}
        className={[
          styles.weekColumn,
          compact && styles.weekColumnCompact,
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
              size="medium"
              icon={CaretLeft}
              iconPosition="icon-only"
              className={styles.navButton}
              aria-label={view === 'week' ? 'Semana anterior' : 'Mês anterior'}
              onClick={handlePrevious}
            />
            <Button
              type="button"
              variant="ghost"
              size="medium"
              icon={CaretRight}
              iconPosition="icon-only"
              className={styles.navButton}
              aria-label={view === 'week' ? 'Próxima semana' : 'Próximo mês'}
              onClick={handleNext}
            />
          </div>
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

        <div className={styles.toolbarActions}>
          <Button
            type="button"
            variant="ghost"
            size="medium"
            icon={CirclesFour}
            iconPosition="left"
            className={styles.appsButton}
            onClick={onAppsClick}
          >
            Apps
          </Button>
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
          <div className={styles.weekGrid}>
            {weekDays.slice(0, 5).map((day, index) => renderWeekDayColumn(day, PT_WEEKDAY_LONG[index]))}
            <div className={styles.weekendColumn}>
              {renderWeekDayColumn(weekDays[5], PT_WEEKDAY_LONG[5], true)}
              {renderWeekDayColumn(weekDays[6], PT_WEEKDAY_LONG[6], true)}
            </div>
          </div>

          <div
            className={`${styles.somedayRow} ${dropTargetKey === 'undated' ? styles.dropTarget : ''}`}
            onDragEnter={() => setDropTargetKey('undated')}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setDropTargetKey('undated');
            }}
            onDragLeave={() => setDropTargetKey(null)}
            onDrop={(event) => void handleDropOnUndated(event)}
          >
            <div className={styles.somedayHeader}>Sem data</div>
            <div className={styles.somedayTasks}>
              {Array.from({ length: 4 }).map((_, colIndex) => {
                const colTasks = undatedTasks.slice(colIndex * 4, colIndex * 4 + 4);
                const emptyCount = Math.max(0, 4 - colTasks.length);
                return (
                  <div key={`someday-col-${colIndex}`} className={styles.somedayColumn}>
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
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.monthSurface}>
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

              return (
                <div
                  key={dateKey}
                  className={[
                    styles.monthCell,
                    !isCurrentMonth && styles.monthCellMuted,
                    isToday && styles.monthCellToday,
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
                  <div className={styles.monthCellHeader}>
                    <span className={styles.monthDayNumber}>{day.getDate()}</span>
                  </div>

                  <div className={styles.monthTasks}>
                    {visibleTasks.map((task) => (
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
                    {hiddenCount > 0 && (
                      <button
                        type="button"
                        className={styles.moreButton}
                        onClick={() => handleOverflowClick(day)}
                      >
                        +{hiddenCount}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
