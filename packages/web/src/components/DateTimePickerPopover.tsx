import React, { useState, useEffect } from 'react';
import { X, Calendar as CalendarIcon, Clock } from 'phosphor-react';

interface DateTimePickerPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onDateTimeSelect: (date: string, time?: string) => void;
  position?: { top: number; left: number } | null;
  initialDate?: string;
  initialTime?: string;
}

export const DateTimePickerPopover: React.FC<DateTimePickerPopoverProps> = ({
  isOpen,
  onClose,
  onDateTimeSelect,
  position,
  initialDate,
  initialTime,
}) => {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [canClose, setCanClose] = useState(false);

  // Gerar slots de horário de 15 em 15 minutos das 06:00 às 23:45
  const timeSlots = Array.from({ length: 72 }, (_, i) => {
    const totalMinutes = i * 15 + 6 * 60; // Começar às 06:00
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    
    if (hour >= 24) return null;
    
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  }).filter(Boolean) as string[];

  // Permitir fechar apenas após um pequeno delay
  useEffect(() => {
    if (isOpen) {
      setCanClose(false);
      const timer = setTimeout(() => {
        setCanClose(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Pré-selecionar data e horário iniciais
  useEffect(() => {
    if (isOpen) {
      if (initialDate) {
        try {
          let date: Date;
          if (initialDate.includes('T')) {
            date = new Date(initialDate);
          } else {
            date = new Date(initialDate + 'T00:00:00');
          }
          
          if (!isNaN(date.getTime())) {
            setSelectedDate(date);
          }
        } catch (error) {
          console.error('Erro ao processar data inicial:', error);
        }
      }
      
      if (initialTime) {
        setSelectedTime(initialTime);
      }
    } else {
      setSelectedDate(undefined);
      setSelectedTime('');
    }
  }, [isOpen, initialDate, initialTime]);

  const handleConfirm = () => {
    if (selectedDate) {
      const formattedDate = selectedDate.getFullYear() + '-' + 
        String(selectedDate.getMonth() + 1).padStart(2, '0') + '-' + 
        String(selectedDate.getDate()).padStart(2, '0');
      
      onDateTimeSelect(formattedDate, selectedTime || undefined);
      onClose();
    }
  };

  const handleCancel = () => {
    setSelectedDate(undefined);
    setSelectedTime('');
    onClose();
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && canClose) {
      onClose();
    }
  };

  // Gerar dias do mês atual
  const generateCalendarDays = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    const days = [];
    const current = new Date(startDate);
    
    while (current <= lastDay || current.getDay() !== 0) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
      if (days.length > 42) break; // Máximo 6 semanas
    }
    
    return days;
  };

  const currentDate = selectedDate || new Date();
  const calendarDays = generateCalendarDays(currentDate);
  const today = new Date();
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* Overlay */}
      <div 
        className="fixed inset-0 z-40" 
        onClick={handleOverlayClick}
      />
      
      {/* Popover */}
      <div
        className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl overflow-hidden"
        style={
          position
            ? (() => {
                const popoverWidth = 480;
                const popoverHeight = 400;
                const margin = 20;
                
                // Calcular posição ajustada para não sair da tela
                let adjustedTop = position.top - popoverHeight - 10;
                let adjustedLeft = position.left;
                let transform = 'translate(-50%, 0)';
                
                // Verificar se sai pela esquerda
                if (adjustedLeft - popoverWidth / 2 < margin) {
                  adjustedLeft = margin + popoverWidth / 2;
                }
                
                // Verificar se sai pela direita
                if (adjustedLeft + popoverWidth / 2 > window.innerWidth - margin) {
                  adjustedLeft = window.innerWidth - margin - popoverWidth / 2;
                }
                
                // Verificar se sai pelo topo
                if (adjustedTop < margin) {
                  adjustedTop = position.top + 40; // Mostrar abaixo do elemento
                  transform = 'translate(-50%, 0)';
                }
                
                return {
                  top: adjustedTop,
                  left: adjustedLeft,
                  transform,
                  width: `${popoverWidth}px`,
                };
              })()
            : {
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '480px',
              }
        }
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-600">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center space-x-2">
            <CalendarIcon className="w-4 h-4" />
            <span>Definir Data e Horário</span>
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex">
          {/* Calendário */}
          <div className="flex-1 p-4">
            {/* Navegação do mês */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => {
                  const newDate = new Date(currentDate);
                  newDate.setMonth(newDate.getMonth() - 1);
                  setSelectedDate(newDate);
                }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                ‹
              </button>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
              </span>
              <button
                onClick={() => {
                  const newDate = new Date(currentDate);
                  newDate.setMonth(newDate.getMonth() + 1);
                  setSelectedDate(newDate);
                }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                ›
              </button>
            </div>

            {/* Dias da semana */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                <div key={day} className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Dias do calendário */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, index) => {
                const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                const isSelected = selectedDate && 
                  day.getDate() === selectedDate.getDate() && 
                  day.getMonth() === selectedDate.getMonth() && 
                  day.getFullYear() === selectedDate.getFullYear();
                const isToday = day.toDateString() === today.toDateString();
                const isPast = day < today && !isToday;

                return (
                  <button
                    key={index}
                    onClick={() => setSelectedDate(day)}
                    disabled={isPast}
                    className={`
                      w-8 h-8 text-xs rounded transition-colors
                      ${!isCurrentMonth ? 'text-gray-300 dark:text-gray-600' : ''}
                      ${isPast ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}
                      ${isSelected ? 'bg-blue-600 text-white hover:bg-blue-700' : ''}
                      ${isToday && !isSelected ? 'bg-gray-200 dark:bg-gray-600 font-medium' : ''}
                    `}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Horários */}
          <div className="w-48 border-l border-gray-200 dark:border-gray-600 flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-gray-600">
              <div className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300">
                <Clock className="w-4 h-4" />
                <span>Horários</span>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto max-h-60">
              <div className="p-2 space-y-1">
                {timeSlots.map(time => (
                  <button
                    key={time}
                    onClick={() => setSelectedTime(time)}
                    className={`
                      w-full px-3 py-2 text-xs rounded transition-colors text-left
                      ${selectedTime === time 
                        ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' 
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }
                    `}
                  >
                    {time}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-4 border-t border-gray-200 dark:border-gray-600">
          <div className="text-xs text-gray-600 dark:text-gray-400">
            {selectedDate && selectedTime ? (
              <span>
                {selectedDate.toLocaleDateString('pt-BR', { 
                  weekday: 'long', 
                  day: 'numeric', 
                  month: 'long' 
                })} às {selectedTime}
              </span>
            ) : (
              'Selecione uma data e horário'
            )}
          </div>
          
          <div className="flex space-x-2">
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedDate}
              className={`px-4 py-2 text-xs font-medium text-white rounded transition-colors ${
                selectedDate
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-blue-400 cursor-not-allowed opacity-70'
              }`}
            >
              Definir
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
