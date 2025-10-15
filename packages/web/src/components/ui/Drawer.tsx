import React from 'react';
import { X } from 'lucide-react';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  children,
  className = '',
}) => {
  if (!isOpen) return null;

  return (
    <div className={`fixed left-[10%] top-0 right-0 bottom-0 z-40 bg-white dark:bg-gray-900 shadow-xl border-l border-gray-200 dark:border-gray-700 ${className}`}>
      {/* Header */}
      <div className="p-6 flex items-center justify-between">
        <button
          onClick={onClose}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <X className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        </button>
        {title && (
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h2>
        )}
        <div className="w-8"></div> {/* Spacer para centralizar o título */}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 h-full">
        {children}
      </div>
    </div>
  );
};
