import React from 'react';
import { Tag } from 'phosphor-react';
import { useCategories } from '../../hooks/useCategories';

export interface CategoryBadgeProps {
  categoryName: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'outline' | 'minimal';
  showIcon?: boolean;
  className?: string;
  onClick?: () => void;
}

export const CategoryBadge: React.FC<CategoryBadgeProps> = ({
  categoryName,
  size = 'sm',
  variant = 'default',
  showIcon = true,
  className = '',
  onClick,
}) => {
  const { categories } = useCategories();
  
  const category = categories.find(cat => cat.name === categoryName);
  const color = category?.color || 'gray';
  
  // Tamanhos
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base',
  };
  
  // Mapa de cores completo para Tailwind (classes estáticas)
  const colorMap = {
    blue: {
      default: 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200',
      outline: 'border-2 border-blue-300 dark:border-blue-500 text-blue-700 dark:text-blue-200 bg-transparent',
      minimal: 'text-blue-600 dark:text-blue-300 bg-transparent',
      icon: 'text-blue-600 dark:text-blue-300',
    },
    green: {
      default: 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200',
      outline: 'border-2 border-green-300 dark:border-green-500 text-green-700 dark:text-green-200 bg-transparent',
      minimal: 'text-green-600 dark:text-green-300 bg-transparent',
      icon: 'text-green-600 dark:text-green-300',
    },
    purple: {
      default: 'bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200',
      outline: 'border-2 border-purple-300 dark:border-purple-500 text-purple-700 dark:text-purple-200 bg-transparent',
      minimal: 'text-purple-600 dark:text-purple-300 bg-transparent',
      icon: 'text-purple-600 dark:text-purple-300',
    },
    red: {
      default: 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200',
      outline: 'border-2 border-red-300 dark:border-red-500 text-red-700 dark:text-red-200 bg-transparent',
      minimal: 'text-red-600 dark:text-red-300 bg-transparent',
      icon: 'text-red-600 dark:text-red-300',
    },
    yellow: {
      default: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200',
      outline: 'border-2 border-yellow-300 dark:border-yellow-500 text-yellow-700 dark:text-yellow-200 bg-transparent',
      minimal: 'text-yellow-600 dark:text-yellow-300 bg-transparent',
      icon: 'text-yellow-600 dark:text-yellow-300',
    },
    gray: {
      default: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200',
      outline: 'border-2 border-gray-300 dark:border-gray-500 text-gray-700 dark:text-gray-200 bg-transparent',
      minimal: 'text-gray-600 dark:text-gray-300 bg-transparent',
      icon: 'text-gray-600 dark:text-gray-300',
    },
  };
  
  const colorClasses = colorMap[color as keyof typeof colorMap] || colorMap.gray;
  const variantClass = colorClasses[variant];
  const iconClass = colorClasses.icon;
  
  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };
  
  const baseClasses = `
    inline-flex items-center space-x-1.5 rounded-full font-medium transition-colors
    ${sizeClasses[size]}
    ${variantClass}
    ${onClick ? 'cursor-pointer hover:opacity-80' : ''}
    ${className}
  `.trim();
  
  return (
    <span className={baseClasses} onClick={onClick}>
      {showIcon && (
        <Tag weight="fill" className={`${iconSizes[size]} ${iconClass}`} />
      )}
      <span>{categoryName}</span>
    </span>
  );
};
