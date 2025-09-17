import React, { useState } from 'react';
import { X } from 'phosphor-react';

interface DatePickerPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onDateSelect: (date: string) => void;
  triggerRef?: React.RefObject<HTMLElement>;
}

export const DatePickerPopover: React.FC<DatePickerPopoverProps> = ({
  isOpen,
  onClose,
  onDateSelect,
}) => {
  const [selectedDate, setSelectedDate] = useState('');

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value);
  };

  const handleConfirm = () => {
    if (selectedDate) {
      onDateSelect(selectedDate);
      setSelectedDate('');
      onClose();
    }
  };

  const handleCancel = () => {
    setSelectedDate('');
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* Overlay para fechar o popover */}
      <div 
        className="fixed inset-0 z-40" 
        onClick={onClose}
      />
      
      {/* Popover */}
      <div
        className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-4 min-w-[280px]"
        style={{
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
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
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Data da Tarefa
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={handleDateChange}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              min={new Date().toISOString().split('T')[0]}
            />
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
