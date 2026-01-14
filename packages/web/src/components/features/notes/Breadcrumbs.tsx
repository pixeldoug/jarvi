import React from 'react';
import { House, ArrowRight } from '@phosphor-icons/react';

interface BreadcrumbItem {
  label: string;
  path?: string;
  onClick?: () => void;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  onHomeClick?: () => void;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items, onHomeClick }) => {
  return (
    <nav className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400 mb-4">
      {/* Home button */}
      <button
        onClick={onHomeClick}
        className="flex items-center space-x-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        title="Voltar para lista de notas"
      >
        <House className="w-4 h-4" />
        <span>Notas</span>
      </button>

      {/* Breadcrumb items */}
      {items.map((item, index) => (
        <React.Fragment key={index}>
          <ArrowRight className="w-3 h-3" />
          {item.onClick ? (
            <button
              onClick={item.onClick}
              className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              title={item.label}
            >
              {item.label}
            </button>
          ) : (
            <span className="text-gray-700 dark:text-gray-300 font-medium">
              {item.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
};
