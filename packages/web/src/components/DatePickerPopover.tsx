import React, { useState, useEffect } from 'react';
import { X } from 'phosphor-react';
import { DateInputBR } from './DateInputBR';
import { TimeInputBR } from './TimeInputBR';

interface DatePickerPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onDateSelect: (date: string, time?: string) => void;
  triggerRef?: React.RefObject<HTMLElement>;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  position?: { top: number; left: number } | null;
  initialDate?: string;
  initialTime?: string;
}

export const DatePickerPopover: React.FC<DatePickerPopoverProps> = ({
  isOpen,
  onClose,
  onDateSelect,
  onMouseEnter,
  onMouseLeave,
  position,
  initialDate,
  initialTime,
}) => {
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [canClose, setCanClose] = useState(false);

  // Permitir fechar apenas após um pequeno delay para evitar fechamento imediato
  useEffect(() => {
    if (isOpen) {
      setCanClose(false);
      const timer = setTimeout(() => {
        setCanClose(true);
      }, 100);
      return () => clearTimeout(timer);
    } else {
    }
  }, [isOpen]);

  // Pré-selecionar a data inicial quando o popover abrir
  useEffect(() => {
    if (isOpen && initialDate) {
      try {
        // Usar o mesmo parsing que o TaskItem para consistência
        let date: Date;
        if (initialDate.includes('T')) {
          // Para datas com timestamp, extrair apenas a parte da data (YYYY-MM-DD)
          const dateOnly = initialDate.split('T')[0];
          const [year, month, day] = dateOnly.split('-').map(Number);
          date = new Date(year, month - 1, day); // month é 0-indexed, usar timezone local
        } else {
          // Para datas simples (YYYY-MM-DD), usar diretamente
          const [year, month, day] = initialDate.split('-').map(Number);
          date = new Date(year, month - 1, day); // month é 0-indexed
        }
        
        if (!isNaN(date.getTime())) {
          const formattedDate = date.getFullYear() + '-' + 
            String(date.getMonth() + 1).padStart(2, '0') + '-' + 
            String(date.getDate()).padStart(2, '0');
          setSelectedDate(formattedDate);
        }
      } catch (error) {
        console.error('Erro ao processar data inicial:', error);
      }
    } else if (!isOpen) {
      setSelectedDate('');
      setSelectedTime('');
    }
  }, [isOpen, initialDate]);

  // Pré-selecionar o horário inicial quando o popover abrir
  useEffect(() => {
    if (isOpen && initialTime) {
      setSelectedTime(initialTime);
    } else if (!isOpen) {
      setSelectedTime('');
    }
  }, [isOpen, initialTime]);


  const handleConfirm = () => {
    if (selectedDate) {
      onDateSelect(selectedDate, selectedTime);
      setSelectedDate('');
      setSelectedTime('');
      onClose();
    }
  };

  const handleCancel = () => {
    setSelectedDate('');
    setSelectedTime('');
    onClose();
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    // Não fechar se o clique foi no popover em si
    if (e.target === e.currentTarget && canClose) {
      onClose();
    }
  };

  console.log('DatePickerPopover render:', { isOpen, position });

  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* Overlay para fechar o popover */}
      <div 
        className="fixed inset-0 z-40" 
        onClick={handleOverlayClick}
      />
      
      {/* Popover */}
      <div
        className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-4 min-w-[280px]"
        style={
          position
            ? {
                top: position.top,
                left: position.left,
                transform: 'translate(-50%, -100%)', // Centralizado horizontalmente e acima do botão
              }
            : {
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)', // Fallback para o centro
              }
        }
        onClick={(e) => {
          e.stopPropagation();
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
        onMouseEnter={() => {
          onMouseEnter?.();
        }}
        onMouseLeave={() => {
          onMouseLeave?.();
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Definir Data
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Data da Tarefa
              </label>
              <DateInputBR
                value={selectedDate}
                onChange={(date) => setSelectedDate(date)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Horário (opcional)
              </label>
              <TimeInputBR
                value={selectedTime}
                onChange={(time) => setSelectedTime(time)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder="14:30"
              />
            </div>
          </div>
          
          <div className="flex space-x-2 pt-2">
            <button
              onClick={handleConfirm}
              disabled={!selectedDate}
              className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Definir Data
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-2 text-gray-600 dark:text-gray-400 text-sm font-medium rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
