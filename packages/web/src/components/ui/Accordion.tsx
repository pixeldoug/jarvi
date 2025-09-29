import React, { useState, ReactNode } from 'react';

export interface AccordionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  variant?: 'default' | 'subtle';
  className?: string;
  titleClassName?: string;
  contentClassName?: string;
  showCounter?: boolean;
  counter?: number;
}

export const Accordion: React.FC<AccordionProps> = ({
  title,
  children,
  defaultOpen = false,
  variant = 'default',
  className = '',
  titleClassName = '',
  contentClassName = '',
  showCounter = false,
  counter = 0,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const toggleOpen = () => {
    setIsOpen(!isOpen);
  };

  const baseClasses = 'border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden';
  const variantClasses = {
    default: 'bg-white dark:bg-gray-800',
    subtle: 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-700/50',
  };

  const titleBaseClasses = 'w-full px-4 py-3 text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset transition-colors duration-200';
  const titleVariantClasses = {
    default: 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 font-medium',
    subtle: 'bg-transparent hover:bg-gray-100/50 dark:hover:bg-gray-700/30 text-gray-600 dark:text-gray-400 text-sm font-normal',
  };

  const contentBaseClasses = 'overflow-hidden transition-all duration-300 ease-in-out';
  const contentVariantClasses = {
    default: 'bg-white dark:bg-gray-800',
    subtle: 'bg-transparent',
  };

  return (
    <div className={`${baseClasses} ${variantClasses[variant]} ${className}`}>
      <button
        onClick={toggleOpen}
        className={`${titleBaseClasses} ${titleVariantClasses[variant]} ${titleClassName}`}
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          <span>{title}</span>
          {showCounter && counter > 0 && (
            <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-200 dark:bg-gray-600 rounded-full">
              {counter}
            </span>
          )}
        </div>
        
        <svg
          className={`w-5 h-5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''} ${
            variant === 'subtle' ? 'text-gray-400' : 'text-gray-500 dark:text-gray-400'
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      
      <div
        className={`${contentBaseClasses} ${contentVariantClasses[variant]} ${
          isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className={`p-4 ${contentClassName}`}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default Accordion;
