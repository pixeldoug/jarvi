/**
 * Modal Component - Jarvi Web
 * 
 * Componente Modal otimizado para web com design tokens
 */

import React from 'react';
import { X } from 'phosphor-react';
// import { useThemeClasses } from '../../hooks/useTheme';

// ============================================================================
// TIPOS
// ============================================================================

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

// ============================================================================
// COMPONENTE
// ============================================================================

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  // size = 'md',
  className = '',
}: ModalProps) {
  // const { isDark } = useThemeClasses();

  if (!isOpen) return null;

  // Classes de tamanho
  // const sizeClasses = {
  //   sm: 'max-w-md',
  //   md: 'max-w-lg',
  //   lg: 'max-w-2xl',
  //   xl: 'max-w-4xl',
  // };

  // Classes de tema
  // const themeClasses = isDark
  //   ? 'bg-gray-800 border-gray-700'
  //   : 'bg-white border-gray-200';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className={`relative top-20 mx-auto p-5 border shadow-lg rounded-lg bg-white dark:bg-gray-800 ${className}`}>
        <div className="mt-3">
          {title && (
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                {title}
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}
          
          <div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
