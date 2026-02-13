/**
 * TagInput Component - Jarvi Web
 * 
 * Tag input component with Badge tags and dropdown functionality
 * Following JarviDS design system from Figma
 */

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { CaretDown, Hash, type IconProps } from '@phosphor-icons/react';
import { Badge } from '../Badge';
import { Dropdown } from '../Dropdown/Dropdown';
import { ListItem } from '../ListItem';
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

type PhosphorIcon = React.ComponentType<IconProps>;

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
  /** Available options for built-in dropdown mode */
  options?: Tag[];
  /** Force dropdown token theme */
  dropdownTheme?: 'light' | 'dark';
  /** Optional section rendered below dropdown options */
  dropdownButtonSection?: ReactNode;
  /** Optional custom dropdown content renderer */
  renderDropdownContent?: (context: {
    options: Tag[];
    selectedTags: Tag[];
    isOptionSelected: (optionId: string) => boolean;
    toggleOption: (option: Tag) => void;
    closeDropdown: () => void;
  }) => ReactNode;
  /** Optional icon displayed on each dropdown option */
  optionIcon?: PhosphorIcon;
  /** Close dropdown after selecting one option */
  closeOnSelect?: boolean;
  /** Callback when dropdown open state changes */
  onDropdownOpenChange?: (isOpen: boolean) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function TagInput({
  label = 'Tags',
  showLabel = true,
  placeholder = 'Selecionar',
  tags,
  onTagsChange,
  onTagRemove,
  onDropdownClick,
  disabled = false,
  showBadgePrefix = true,
  className = '',
  options,
  dropdownTheme,
  dropdownButtonSection,
  renderDropdownContent,
  optionIcon: OptionIcon,
  closeOnSelect = false,
  onDropdownOpenChange,
}: TagInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [internalTags, setInternalTags] = useState<Tag[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasBuiltInDropdown = Boolean(options || renderDropdownContent);
  const availableOptions = options ?? [];
  const selectedTags = tags ?? internalTags;
  const selectedTagIds = useMemo(
    () => new Set(selectedTags.map((tag) => tag.id)),
    [selectedTags]
  );
  const dropdownWidth = containerRef.current?.offsetWidth ?? 272;

  const updateTags = (nextTags: Tag[]) => {
    if (tags === undefined) {
      setInternalTags(nextTags);
    }
    onTagsChange?.(nextTags);
  };

  const setDropdownOpen = (nextIsOpen: boolean) => {
    setIsOpen(nextIsOpen);
    onDropdownOpenChange?.(nextIsOpen);
  };

  const handleFocus = () => {
    if (!disabled) {
      setIsFocused(true);
    }
  };

  const handleBlur = (e: React.FocusEvent) => {
    if (isOpen) return;

    // Only blur if focus leaves the entire container
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setIsFocused(false);
    }
  };

  const handleRemoveTag = (tagToRemove: Tag) => {
    if (disabled) return;
    
    onTagRemove?.(tagToRemove);

    const newTags = selectedTags.filter((tag) => tag.id !== tagToRemove.id);
    updateTags(newTags);
  };

  const handleDropdownToggle = () => {
    if (!disabled) {
      onDropdownClick?.();

      if (hasBuiltInDropdown) {
        setDropdownOpen(!isOpen);
      }

      setIsFocused(true);
    }
  };

  const handleContainerClick = () => {
    if (disabled) return;

    handleFocus();
    onDropdownClick?.();

    if (hasBuiltInDropdown) {
      setDropdownOpen(!isOpen);
    }
  };

  const handleDropdownClose = () => {
    setDropdownOpen(false);
    setIsFocused(false);
  };

  const handleSelectOption = (option: Tag) => {
    if (disabled) return;

    const isSelected = selectedTagIds.has(option.id);
    if (isSelected) {
      onTagRemove?.(option);
      updateTags(selectedTags.filter((tag) => tag.id !== option.id));
    } else {
      updateTags([...selectedTags, option]);
    }

    if (closeOnSelect) {
      handleDropdownClose();
    }
  };

  const hasTags = selectedTags.length > 0;

  const containerClasses = [
    styles.inputContainer,
    (isFocused || isOpen) && styles.focused,
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
        aria-expanded={hasBuiltInDropdown ? isOpen : isFocused}
        aria-haspopup="listbox"
        aria-disabled={disabled}
      >
        <div className={styles.tagsContainer}>
          {hasTags ? (
            selectedTags.map((tag) => (
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
            className={[
              styles.dropdownButton,
              hasBuiltInDropdown && isOpen && styles.dropdownButtonOpen,
            ].filter(Boolean).join(' ')}
            onClick={(e) => {
              e.stopPropagation();
              handleDropdownToggle();
            }}
            disabled={disabled}
            aria-label="Toggle dropdown"
            tabIndex={-1}
          >
            <CaretDown size={20} weight="regular" />
          </button>
        </div>
      </div>

      {hasBuiltInDropdown && (
        <Dropdown
          isOpen={isOpen}
          onClose={handleDropdownClose}
          anchorRef={containerRef}
          width={dropdownWidth}
          forceTheme={dropdownTheme}
          buttonSection={dropdownButtonSection}
        >
          {renderDropdownContent ? (
            renderDropdownContent({
              options: availableOptions,
              selectedTags,
              isOptionSelected: (optionId: string) => selectedTagIds.has(optionId),
              toggleOption: handleSelectOption,
              closeDropdown: handleDropdownClose,
            })
          ) : (
            <div className={styles.options} role="listbox" aria-label={label}>
              {availableOptions.map((option) => {
                const isSelected = selectedTagIds.has(option.id);
                const iconNode = OptionIcon
                  ? <OptionIcon size={16} weight="regular" />
                  : option.prefixIcon ?? <Hash size={16} weight="regular" />;

                return (
                  <ListItem
                    key={option.id}
                    label={option.label}
                    iconNode={iconNode}
                    onClick={() => handleSelectOption(option)}
                    buttonProps={{
                      role: 'option',
                      'aria-selected': isSelected,
                    }}
                  />
                );
              })}
            </div>
          )}
        </Dropdown>
      )}
    </div>
  );
}


