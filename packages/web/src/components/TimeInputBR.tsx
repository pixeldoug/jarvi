import React, { useState, useEffect } from 'react';

interface TimeInputBRProps {
  value: string; // Formato HH:MM
  onChange: (value: string) => void; // Retorna HH:MM
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

export const TimeInputBR: React.FC<TimeInputBRProps> = ({
  value,
  onChange,
  className = '',
  placeholder = 'HH:MM',
  disabled = false,
}) => {
  const [displayValue, setDisplayValue] = useState('');

  // Sincronizar com o valor externo
  useEffect(() => {
    setDisplayValue(value || '');
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputValue = e.target.value;
    
    // Remover caracteres não numéricos exceto :
    inputValue = inputValue.replace(/[^\d:]/g, '');
    
    // Aplicar máscara HH:MM
    if (inputValue.length <= 2) {
      // HH
      setDisplayValue(inputValue);
    } else if (inputValue.length <= 5) {
      // HH:MM
      const hours = inputValue.slice(0, 2);
      const minutes = inputValue.slice(2);
      setDisplayValue(`${hours}:${minutes}`);
    }
  };

  const handleBlur = () => {
    // Validar e formatar o horário quando o usuário sair do campo
    if (displayValue.length === 5) { // HH:MM
      try {
        const [hours, minutes] = displayValue.split(':');
        const h = parseInt(hours, 10);
        const m = parseInt(minutes, 10);
        
        // Validar se é um horário válido
        if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
          const formattedTime = `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
          setDisplayValue(formattedTime);
          onChange(formattedTime);
        } else {
          // Horário inválido, limpar
          setDisplayValue('');
          onChange('');
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
    
    // Permitir apenas números e :
    if (!/[\d:]/.test(e.key)) {
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
      maxLength={5}
    />
  );
};

