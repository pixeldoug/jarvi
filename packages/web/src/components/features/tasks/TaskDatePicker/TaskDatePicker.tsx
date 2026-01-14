/**
 * TaskDatePicker Component - Jarvi Web
 * 
 * Date picker popover for task creation/editing
 * Specific to the tasks context (ControlBar, TaskItem, etc.)
 * Based on Figma node 40000060:5329 and 40000409:8350
 */

import { useRef, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Flag, SunHorizon, Couch, Prohibit, Clock, XCircle } from '@phosphor-icons/react';
import { Calendar } from '../../../ui/Calendar';
import { Button } from '../../../ui/Button';
import { TextInput } from '../../../ui/TextInput';
import styles from './TaskDatePicker.module.css';

export interface TaskDatePickerProps {
  /** Whether the popover is open */
  isOpen: boolean;
  /** Callback when the popover should close */
  onClose: () => void;
  /** Currently selected date */
  selectedDate?: Date;
  /** Callback when a date is selected */
  onDateSelect: (date: Date | null) => void;
  /** Callback when time is selected */
  onTimeSelect?: (time: string | null) => void;
  /** Currently selected time string (e.g., "14:00") */
  selectedTime?: string;
  /** Anchor element reference for positioning */
  anchorRef?: React.RefObject<HTMLElement>;
  /** Additional CSS classes */
  className?: string;
}

type ShortcutType = 'today' | 'tomorrow' | 'nextWeek' | 'noDate';

interface ShortcutItem {
  id: ShortcutType;
  label: string;
  icon: React.ElementType;
  getDate: () => Date | null;
}

const SHORTCUTS: ShortcutItem[] = [
  {
    id: 'today',
    label: 'Hoje',
    icon: Flag,
    getDate: () => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d;
    },
  },
  {
    id: 'tomorrow',
    label: 'Amanhã',
    icon: SunHorizon,
    getDate: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(0, 0, 0, 0);
      return d;
    },
  },
  {
    id: 'nextWeek',
    label: 'Semana que vem',
        icon: Couch, 
    getDate: () => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      d.setHours(0, 0, 0, 0);
      return d;
    },
  },
  {
    id: 'noDate',
    label: 'Sem Data',
    icon: Prohibit,
    getDate: () => null,
  },
];

// Generate time slots for the time picker
function generateTimeSlots(startHour: number = 6, endHour: number = 23, interval: number = 30): string[] {
  const slots: string[] = [];
  for (let hour = startHour; hour <= endHour; hour++) {
    for (let minute = 0; minute < 60; minute += interval) {
      if (hour === endHour && minute > 0) break;
      const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      slots.push(timeStr);
    }
  }
  return slots;
}

export function TaskDatePicker({
  isOpen,
  onClose,
  selectedDate,
  onDateSelect,
  onTimeSelect,
  selectedTime,
  anchorRef,
  className = '',
}: TaskDatePickerProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const selectedTimeItemRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [manualTime, setManualTime] = useState(selectedTime || '');
  
  // Generate time slots
  const timeSlots = useMemo(() => generateTimeSlots(), []);

  // Lógica de posicionamento simples e robusta
  useEffect(() => {
    if (!isOpen || !anchorRef?.current) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      if (!anchorRef?.current) return;

      const rect = anchorRef.current.getBoundingClientRect();
      const popoverWidth = 288;
      const popoverHeight = popoverRef.current?.offsetHeight || 480;
      const gap = 8;
      const margin = 16;

      // Calcular posição acima do chip
      let top = rect.top - popoverHeight - gap;
      let left = rect.left;

      // Se não cabe acima, posicionar abaixo
      if (top < margin) {
        top = rect.bottom + gap;
      }

      // Ajustar horizontalmente se sair da tela
      if (left + popoverWidth > window.innerWidth - margin) {
        left = window.innerWidth - popoverWidth - margin;
      }
      if (left < margin) {
        left = margin;
      }

      // Garantir que não saia da tela verticalmente
      top = Math.max(margin, Math.min(top, window.innerHeight - popoverHeight - margin));

      setPosition({ top, left });
    };

    // Calcular imediatamente
    updatePosition();

    // Recalcular quando o popover tiver altura real
    const timeoutId = setTimeout(updatePosition, 10);

    // Recalcular em resize e scroll
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, anchorRef]);

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef?.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    // Add slight delay to prevent immediate close
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose, anchorRef]);

  // Format the header title based on selected date and time
  const headerTitle = useMemo(() => {
    // Se não há data selecionada, mostrar "Selecionar data"
    if (!selectedDate) {
      return 'Selecionar data';
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);
    
    // Sufixo de horário se houver
    const timeSuffix = selectedTime ? ` ${selectedTime}` : '';
    
    // Se for hoje, mostrar "Hoje" ou "Hoje 14:00"
    if (selected.getTime() === today.getTime()) {
      return `Hoje${timeSuffix}`;
    }
    
    // Se for amanhã, mostrar "Amanhã" ou "Amanhã 14:00"
    if (selected.getTime() === tomorrow.getTime()) {
      return `Amanhã${timeSuffix}`;
    }
    
    // Para outras datas, mostrar formato "25 Jul" ou "25 Jul 14:00"
    const day = selectedDate.getDate();
    const month = selectedDate.toLocaleDateString('pt-BR', { month: 'short' })
      .replace('.', '')
      .replace(/^./, str => str.toUpperCase());
    
    return `${day} ${month}${timeSuffix}`;
  }, [selectedDate, selectedTime]);

  // Check which shortcut is currently active
  const getActiveShortcut = (): ShortcutType | null => {
    // Se não há data selecionada, "Sem Data" está ativo
    if (!selectedDate) return 'noDate';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);
    
    if (selected.getTime() === today.getTime()) return 'today';
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (selected.getTime() === tomorrow.getTime()) return 'tomorrow';
    
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    if (selected.getTime() === nextWeek.getTime()) return 'nextWeek';
    
    return null;
  };

  const activeShortcut = getActiveShortcut();

  const handleShortcutClick = (shortcut: ShortcutItem) => {
    const date = shortcut.getDate();
    onDateSelect(date);
    // Não fechar o popover - apenas resetar a data quando "Sem Data" é selecionado
    // O popover só fecha ao clicar fora
  };

  const handleCalendarSelect = (date: Date) => {
    onDateSelect(date);
  };

  const handleTimeButtonClick = () => {
    setShowTimePicker(prev => !prev);
  };

  const handleTimeSlotClick = (time: string) => {
    onTimeSelect?.(time);
    setShowTimePicker(false);
  };

  const handleManualTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const cleaned = value.replace(/[^\d:]/g, '').slice(0, 5);
    setManualTime(cleaned);
  };

  const handleManualTimeBlur = () => {
    const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
    const match = manualTime.match(timeRegex);
    if (match) {
      const hours = match[1].padStart(2, '0');
      const minutes = match[2];
      const formattedTime = `${hours}:${minutes}`;
      onTimeSelect?.(formattedTime);
    }
  };

  const handleManualTimeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleManualTimeBlur();
      setShowTimePicker(false);
    } else if (e.key === 'Escape') {
      setShowTimePicker(false);
    }
  };

  const handleClearTime = () => {
    setManualTime('');
    onTimeSelect?.(null);
  };

  // Update manual time when selectedTime changes
  useEffect(() => {
    setManualTime(selectedTime || '');
  }, [selectedTime]);

  // Scroll to selected time when time picker opens
  useEffect(() => {
    if (showTimePicker && selectedTimeItemRef.current) {
      selectedTimeItemRef.current.scrollIntoView({ block: 'center', behavior: 'auto' });
    }
  }, [showTimePicker]);

  // Close time picker when main popover closes
  useEffect(() => {
    if (!isOpen) {
      setShowTimePicker(false);
    }
  }, [isOpen]);

  if (!isOpen || !position) return null;

  const popoverClasses = [styles.popover, className].filter(Boolean).join(' ');

  // Renderizar usando Portal diretamente no body
  return createPortal(
    <>
      {/* Backdrop */}
      <div className={styles.backdrop} onClick={onClose} />
      
      {/* Popover */}
      <div
        ref={popoverRef}
        className={popoverClasses}
        data-theme="dark"
        style={{
          position: 'fixed',
          top: `${position.top}px`,
          left: `${position.left}px`,
          zIndex: 1000,
        }}
      >
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.headerTitle}>{headerTitle}</span>
        </div>

        <hr className={styles.divider} />

        {/* Calendar */}
        <div className={styles.calendarSection} data-theme="dark">
          <Calendar
            selectedDate={selectedDate}
            onDateSelect={handleCalendarSelect}
            showOutsideDays={true}
          />
        </div>

        <hr className={styles.divider} />

        {/* Shortcuts */}
        <div className={styles.shortcuts}>
          {SHORTCUTS.map((shortcut) => {
            const Icon = shortcut.icon;
            // Ativo se for o shortcut identificado
            const isActive = shortcut.id === activeShortcut;
            
            return (
              <button
                key={shortcut.id}
                type="button"
                className={`${styles.shortcutItem} ${isActive ? styles.active : ''}`}
                onClick={() => handleShortcutClick(shortcut)}
              >
                <span className={styles.shortcutIcon}>
                  <Icon weight={isActive ? 'fill' : 'regular'} />
                </span>
                <span className={styles.shortcutLabel}>{shortcut.label}</span>
              </button>
            );
          })}
        </div>

        <hr className={styles.divider} />

        {/* Footer - Define Time Button */}
        <div className={styles.footer}>
          <Button
            variant="secondary"
            size="small"
            icon={Clock}
            iconPosition="left"
            onClick={handleTimeButtonClick}
            className={styles.footerButton}
            active={showTimePicker}
          >
            {selectedTime ? `Horário: ${selectedTime}` : 'Definir Horário'}
          </Button>
        </div>

        {/* Time Picker Dropdown - positioned inside the popover */}
        {showTimePicker && (
          <div className={styles.timePickerDropdown}>
            <div className={styles.timePickerContent}>
              <div className={styles.timePickerHeader}>
                <span className={styles.timePickerTitle}>Defina um horário</span>
              </div>
              <div className={styles.timePickerList}>
                {timeSlots.map((time) => {
                  const isActive = time === selectedTime;
                  return (
                    <button
                      key={time}
                      ref={isActive ? selectedTimeItemRef : null}
                      type="button"
                      className={`${styles.timePickerItem} ${isActive ? styles.active : ''}`}
                      onClick={() => handleTimeSlotClick(time)}
                    >
                      {time}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className={styles.timePickerFooter}>
              <TextInput
                placeholder="00:00"
                value={manualTime}
                onChange={(e) => handleManualTimeChange(e)}
                onBlur={handleManualTimeBlur}
                onKeyDown={handleManualTimeKeyDown}
                showLabel={false}
                actionIcon={(selectedTime || manualTime) ? XCircle : undefined}
                onActionClick={handleClearTime}
                actionAriaLabel="Remover horário"
                className={styles.timePickerInput}
              />
            </div>
          </div>
        )}
      </div>
    </>,
    document.body
  );
}

