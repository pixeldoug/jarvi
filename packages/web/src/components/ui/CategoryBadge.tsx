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
  
  // Variantes
  const variantClasses = {
    default: `bg-${color}-100 dark:bg-${color}-900/30 text-${color}-700 dark:text-${color}-300`,
    outline: `border border-${color}-300 dark:border-${color}-600 text-${color}-700 dark:text-${color}-300 bg-transparent`,
    minimal: `text-${color}-600 dark:text-${color}-400 bg-transparent`,
  };
  
  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };
  
  const baseClasses = `
    inline-flex items-center space-x-1.5 rounded-full font-medium transition-colors
    ${sizeClasses[size]}
    ${variantClasses[variant]}
    ${onClick ? 'cursor-pointer hover:opacity-80' : ''}
    ${className}
  `.trim();
  
  return (
    <span className={baseClasses} onClick={onClick}>
      {showIcon && (
        <Tag weight="fill" className={`${iconSizes[size]} text-${color}-500`} />
      )}
      <span>{categoryName}</span>
    </span>
  );
};
