/**
 * Calendar Component - Jarvi Web
 * 
 * Date picker calendar following JarviDS design system
 * Based on Figma node 236:205
 */

import { useState, useMemo, useEffect } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import styles from './Calendar.module.css';

export interface CalendarProps {
  /** Currently selected date */
  selectedDate?: Date;
  /** Callback when a date is selected */
  onDateSelect?: (date: Date) => void;
  /** Minimum selectable date */
  minDate?: Date;
  /** Maximum selectable date */
  maxDate?: Date;
  /** Whether to show days from previous/next month */
  showOutsideDays?: boolean;
  /** Additional CSS classes */
  className?: string;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function Calendar({
  selectedDate,
  onDateSelect,
  minDate,
  maxDate,
  showOutsideDays = true,
  className = '',
}: CalendarProps) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [viewDate, setViewDate] = useState(() => {
    return selectedDate || new Date();
  });

  // Sincronizar viewDate com selectedDate quando selectedDate muda
  useEffect(() => {
    if (selectedDate) {
      setViewDate(selectedDate);
    }
  }, [selectedDate]);

  // Generate calendar days for the current view month
  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    
    // First day of the month
    const firstDay = new Date(year, month, 1);
    
    // Start from the Sunday of the week containing the first day
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    const days: Date[] = [];
    const current = new Date(startDate);
    
    // Generate 6 weeks (42 days) to ensure we cover all cases
    for (let i = 0; i < 42; i++) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    
    return days;
  }, [viewDate]);

  // Group days into weeks
  const weeks = useMemo(() => {
    const result: Date[][] = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      result.push(calendarDays.slice(i, i + 7));
    }
    return result;
  }, [calendarDays]);

  const handlePrevMonth = () => {
    setViewDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() - 1);
      return newDate;
    });
  };

  const handleNextMonth = () => {
    setViewDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + 1);
      return newDate;
    });
  };

  const handleDayClick = (day: Date) => {
    if (isDisabled(day)) return;
    onDateSelect?.(day);
  };

  const isDisabled = (day: Date): boolean => {
    if (minDate && day < minDate) return true;
    if (maxDate && day > maxDate) return true;
    return false;
  };

  const isSameDay = (a: Date, b: Date): boolean => {
    return a.getDate() === b.getDate() &&
           a.getMonth() === b.getMonth() &&
           a.getFullYear() === b.getFullYear();
  };

  const isCurrentMonth = (day: Date): boolean => {
    return day.getMonth() === viewDate.getMonth();
  };

  const getDayClasses = (day: Date): string => {
    const classes = [styles.dayButton];
    
    const isOutside = !isCurrentMonth(day);
    const isToday = isSameDay(day, today);
    const isSelected = selectedDate && isSameDay(day, selectedDate);
    const disabled = isDisabled(day);
    
    if (isOutside && showOutsideDays) {
      classes.push(styles.dayButtonOutside);
    }
    
    if (isToday && !isSelected) {
      classes.push(styles.dayButtonCurrent);
    }
    
    if (isSelected) {
      classes.push(styles.dayButtonSelected);
    }
    
    if (disabled) {
      classes.push(styles.dayButtonDisabled);
    }
    
    return classes.join(' ');
  };

  const calendarClasses = [styles.calendar, className].filter(Boolean).join(' ');

  return (
    <div className={calendarClasses}>
      {/* Header with month navigation */}
      <div className={styles.header}>
        <button
          type="button"
          className={styles.arrowButton}
          onClick={handlePrevMonth}
          aria-label="Mês anterior"
        >
          <CaretLeft weight="bold" />
        </button>
        
        <span className={styles.monthLabel}>
          {MONTH_NAMES[viewDate.getMonth()]} {viewDate.getFullYear()}
        </span>
        
        <button
          type="button"
          className={styles.arrowButton}
          onClick={handleNextMonth}
          aria-label="Próximo mês"
        >
          <CaretRight weight="bold" />
        </button>
      </div>

      {/* Days grid */}
      <div className={styles.month}>
        {/* Day headers */}
        <div className={styles.week}>
          {DAY_NAMES.map(day => (
            <div key={day} className={styles.dayHeader}>
              {day}
            </div>
          ))}
        </div>

        {/* Day buttons */}
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className={styles.week}>
            {week.map((day, dayIndex) => {
              const isOutside = !isCurrentMonth(day);
              
              if (isOutside && !showOutsideDays) {
                return <div key={dayIndex} className={styles.dayButton} style={{ visibility: 'hidden' }} />;
              }
              
              return (
                <button
                  key={dayIndex}
                  type="button"
                  className={getDayClasses(day)}
                  onClick={() => handleDayClick(day)}
                  disabled={isDisabled(day)}
                  aria-label={day.toLocaleDateString('pt-BR')}
                  aria-selected={selectedDate && isSameDay(day, selectedDate)}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

