/**
 * TagInput Component - Jarvi Web
 * 
 * Tag input component with Badge tags and dropdown functionality
 * Following JarviDS design system from Figma
 */

import { useState, useRef, ReactNode } from 'react';
import { CaretDown, Hash } from '@phosphor-icons/react';
import { Badge } from '../Badge';
import styles from './TagInput.module.css';

// ============================================================================
// TYPES
// ============================================================================

export interface Tag {
  /** Unique identifier for the tag */
  id: string;
  /** Display label for the tag */
  label: string;
  /** Optional custom prefix icon */
  prefixIcon?: ReactNode;
}

export interface TagInputProps {
  /** Label text above the input */
  label?: string;
  /** Whether to show the label */
  showLabel?: boolean;
  /** Placeholder text when no tags selected */
  placeholder?: string;
  /** Array of selected tags */
  tags?: Tag[];
  /** Callback when tags change */
  onTagsChange?: (tags: Tag[]) => void;
  /** Callback when a tag is removed */
  onTagRemove?: (tag: Tag) => void;
  /** Callback when dropdown button is clicked */
  onDropdownClick?: () => void;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Whether to show prefix icon on badges */
  showBadgePrefix?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function TagInput({
  label = 'Tags',
  showLabel = true,
  placeholder = 'Selecionar',
  tags = [],
  onTagsChange,
  onTagRemove,
  onDropdownClick,
  disabled = false,
  showBadgePrefix = true,
  className = '',
}: TagInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleFocus = () => {
    if (!disabled) {
      setIsFocused(true);
    }
  };

  const handleBlur = (e: React.FocusEvent) => {
    // Only blur if focus leaves the entire container
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setIsFocused(false);
    }
  };

  const handleRemoveTag = (tagToRemove: Tag) => {
    if (disabled) return;
    
    onTagRemove?.(tagToRemove);
    
    if (onTagsChange) {
      const newTags = tags.filter(tag => tag.id !== tagToRemove.id);
      onTagsChange(newTags);
    }
  };

  const handleDropdownClick = () => {
    if (!disabled) {
      onDropdownClick?.();
    }
  };

  const handleContainerClick = () => {
    if (!disabled) {
      handleFocus();
      onDropdownClick?.();
    }
  };

  const hasTags = tags.length > 0;

  const containerClasses = [
    styles.inputContainer,
    isFocused && styles.focused,
    disabled && styles.disabled,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={styles.wrapper}>
      {showLabel && label && (
        <label className={styles.label}>
          {label}
        </label>
      )}
      
      <div 
        ref={containerRef}
        className={containerClasses}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onClick={handleContainerClick}
        tabIndex={disabled ? -1 : 0}
        role="combobox"
        aria-expanded={isFocused}
        aria-haspopup="listbox"
        aria-disabled={disabled}
      >
        <div className={styles.tagsContainer}>
          {hasTags ? (
            tags.map((tag) => (
              <Badge
                key={tag.id}
                label={tag.label}
                prefix={showBadgePrefix}
                prefixIcon={tag.prefixIcon || <Hash size={16} weight="regular" />}
                removeable
                disabled={disabled}
                onRemove={() => handleRemoveTag(tag)}
              />
            ))
          ) : (
            <div className={styles.placeholder}>
              {placeholder}
            </div>
          )}
        </div>
        
        <div className={styles.dropdownIconContainer}>
          <button
            type="button"
            className={styles.dropdownButton}
            onClick={(e) => {
              e.stopPropagation();
              handleDropdownClick();
            }}
            disabled={disabled}
            aria-label="Toggle dropdown"
            tabIndex={-1}
          >
            <CaretDown size={20} weight="regular" />
          </button>
        </div>
      </div>
    </div>
  );
}


