/**
 * ThemeToggle Component - Jarvi Web
 * 
 * Componente para alternar entre tema claro e escuro
 */

import { Sun, Moon } from '@phosphor-icons/react';
import { useTheme } from '../../hooks/useTheme';

// ============================================================================
// TIPOS
// ============================================================================

export interface ThemeToggleProps {
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

// ============================================================================
// COMPONENTE
// ============================================================================

export function ThemeToggle({
  size = 'md',
  showLabel = false,
  className = '',
}: ThemeToggleProps) {
  const { toggleTheme, isDark } = useTheme();

  // Classes de tamanho
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  };

  // Classes de ícone
  const iconSizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  return (
    <div className={`flex items-center ${className}`}>
      <button
        onClick={toggleTheme}
        className={`
          ${sizeClasses[size]}
          flex items-center justify-center
          rounded-lg border transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-offset-2
          ${isDark 
            ? 'bg-gray-800 border-gray-600 text-gray-100 hover:bg-gray-700 focus:ring-gray-500' 
            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-500'
          }
        `}
        title={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      >
        {isDark ? (
          <Sun className={iconSizeClasses[size]} />
        ) : (
          <Moon className={iconSizeClasses[size]} />
        )}
      </button>
      
      {showLabel && (
        <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
          {isDark ? 'Tema escuro' : 'Tema claro'}
        </span>
      )}
    </div>
  );
}
