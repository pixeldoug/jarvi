import { ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './WeekNavigator.module.css';

const PT_MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export interface WeekNavigatorProps {
  /** ISO date string of the Monday that starts the displayed week */
  weekStart: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  /** When true the "Hoje" button is hidden (already on the current week) */
  isCurrentWeek?: boolean;
}

/**
 * Inline week navigator — `< Abril 2026 > [Hoje]`
 * Designed to sit next to a page title in MainLayout's titleSuffix slot.
 */
export function WeekNavigator({
  weekStart,
  onPrev,
  onNext,
  onToday,
  isCurrentWeek = false,
}: WeekNavigatorProps) {
  const date = new Date(`${weekStart}T00:00:00`);
  const month = PT_MONTH_NAMES[date.getMonth()];
  const year = date.getFullYear();

  return (
    <div className={styles.root}>
      <div className={styles.monthNav}>
        <button
          type="button"
          className={styles.chevronBtn}
          onClick={onPrev}
          aria-label="Semana anterior"
        >
          <ChevronLeft size={18} />
        </button>
        <span className={styles.monthLabel}>{month} {year}</span>
        <button
          type="button"
          className={styles.chevronBtn}
          onClick={onNext}
          aria-label="Próxima semana"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {!isCurrentWeek && (
        <button
          type="button"
          className={styles.todayBtn}
          onClick={onToday}
        >
          Hoje
        </button>
      )}
    </div>
  );
}
