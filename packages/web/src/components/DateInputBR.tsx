import React, { useState, useEffect } from 'react';

interface DateInputBRProps {
  value: string; // Formato YYYY-MM-DD
  onChange: (value: string) => void; // Retorna YYYY-MM-DD
  className?: string;
  placeholder?: string;
  min?: string;
  disabled?: boolean;
}

export const DateInputBR: React.FC<DateInputBRProps> = ({
  value,
  onChange,
  className = '',
  placeholder = 'DD/MM/YYYY',
  min,
  disabled = false,
}) => {
  const [displayValue, setDisplayValue] = useState('');

  // Converter YYYY-MM-DD para DD/MM/YYYY para exibição
  useEffect(() => {
    if (value) {
      try {
        const [year, month, day] = value.split('-');
        setDisplayValue(`${day}/${month}/${year}`);
      } catch (error) {
        setDisplayValue('');
      }
    } else {
      setDisplayValue('');
    }
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputValue = e.target.value;
    
    // Remover caracteres não numéricos exceto /
    inputValue = inputValue.replace(/[^\d/]/g, '');
    
    // Aplicar máscara DD/MM/YYYY
    if (inputValue.length <= 2) {
      // DD
      setDisplayValue(inputValue);
    } else if (inputValue.length <= 5) {
      // DD/MM
      const day = inputValue.slice(0, 2);
      const month = inputValue.slice(2);
      setDisplayValue(`${day}/${month}`);
    } else {
      // DD/MM/YYYY
      const day = inputValue.slice(0, 2);
      const month = inputValue.slice(2, 4);
      const year = inputValue.slice(4, 8);
      setDisplayValue(`${day}/${month}/${year}`);
    }
  };

  const handleBlur = () => {
    // Converter DD/MM/YYYY para YYYY-MM-DD quando o usuário sair do campo
    if (displayValue.length === 10) { // DD/MM/YYYY
      try {
        const [day, month, year] = displayValue.split('/');
        const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        
        // Validar se é uma data válida
        const date = new Date(isoDate);
        if (!isNaN(date.getTime())) {
          onChange(isoDate);
        }
      } catch (error) {
        // Se não conseguir converter, limpar
        setDisplayValue('');
        onChange('');
      }
    } else if (displayValue === '') {
      onChange('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Permitir navegação e edição
    const allowedKeys = [
      'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 
      'ArrowUp', 'ArrowDown', 'Tab', 'Enter', 'Escape'
    ];
    
    if (allowedKeys.includes(e.key)) {
      return;
    }
    
    // Permitir apenas números e /
    if (!/[\d/]/.test(e.key)) {
      e.preventDefault();
    }
  };

  return (
    <input
      type="text"
      value={displayValue}
      onChange={handleInputChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={className}
      placeholder={placeholder}
      disabled={disabled}
      maxLength={10}
    />
  );
};
