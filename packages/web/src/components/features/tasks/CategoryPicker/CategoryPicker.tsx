/**
 * CategoryPicker Component - Jarvi Web
 * 
 * Category picker dropdown with three states:
 * - Empty: When user has no categories
 * - Filled: List of existing categories
 * - Create: Form to create new category
 * 
 * Based on Figma nodes:
 * - Empty: 40000402:19887
 * - Filled: 40000402:20071
 * - Create: 40000402:20108
 */

import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ghost, Plus, Hash } from '@phosphor-icons/react';
import { Button } from '../../../ui/Button';
import { ListItem } from '../../../ui/ListItem';
import { type Category } from '../../../../contexts/CategoryContext';
import styles from './CategoryPicker.module.css';

export type { Category };

export interface CategoryPickerProps {
  /** Whether the popover is open */
  isOpen: boolean;
  /** Callback when the popover should close */
  onClose: () => void;
  /** List of existing categories */
  categories?: Category[];
  /** Currently selected category */
  selectedCategory?: string;
  /** Callback when a category is selected */
  onSelectCategory?: (category: Category) => void;
  /** Callback when a new category is created */
  onCreateCategory?: (name: string) => void;
  /** Anchor element reference for positioning */
  anchorRef?: React.RefObject<HTMLElement>;
  /** Additional CSS classes */
  className?: string;
}

type ViewState = 'list' | 'create';

export function CategoryPicker({
  isOpen,
  onClose,
  categories = [],
  selectedCategory,
  onSelectCategory,
  onCreateCategory,
  anchorRef,
  className = '',
}: CategoryPickerProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [viewState, setViewState] = useState<ViewState>('list');
  const [newCategoryName, setNewCategoryName] = useState('');

  const isEmpty = categories.length === 0;

  // Reset state when closing
  useEffect(() => {
    if (!isOpen) {
      setViewState('list');
      setNewCategoryName('');
    }
  }, [isOpen]);

  // Focus input when switching to create view
  useEffect(() => {
    if (viewState === 'create' && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [viewState]);

  // Calculate popover position
  useEffect(() => {
    if (!isOpen || !anchorRef?.current) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      if (!anchorRef?.current) return;

      const rect = anchorRef.current.getBoundingClientRect();
      const popoverWidth = 272;
      const popoverHeight = popoverRef.current?.offsetHeight || 250;
      const gap = 8;
      const margin = 16;

      // Position above the chip
      let top = rect.top - popoverHeight - gap;
      let left = rect.left;

      // If doesn't fit above, position below
      if (top < margin) {
        top = rect.bottom + gap;
      }

      // Adjust horizontally if goes off screen
      if (left + popoverWidth > window.innerWidth - margin) {
        left = window.innerWidth - popoverWidth - margin;
      }
      if (left < margin) {
        left = margin;
      }

      // Ensure doesn't go off screen vertically
      top = Math.max(margin, Math.min(top, window.innerHeight - popoverHeight - margin));

      setPosition({ top, left });
    };

    // Calculate immediately
    updatePosition();

    // Recalculate when popover has real height
    const timeoutId = setTimeout(updatePosition, 10);

    // Recalculate on resize and scroll
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, anchorRef, viewState]);

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef?.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    // Add slight delay to prevent immediate close
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose, anchorRef]);

  // Handle keyboard
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (viewState === 'create') {
          setViewState('list');
          setNewCategoryName('');
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, viewState]);

  const handleCategoryClick = (category: Category) => {
    onSelectCategory?.(category);
    onClose();
  };

  const handleNewCategoryClick = () => {
    setViewState('create');
  };

  const handleCancelCreate = () => {
    setViewState('list');
    setNewCategoryName('');
  };

  const handleCreate = () => {
    if (newCategoryName.trim()) {
      onCreateCategory?.(newCategoryName.trim());
      setNewCategoryName('');
      setViewState('list');
      onClose();
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newCategoryName.trim()) {
      handleCreate();
    }
  };

  if (!isOpen || !position) return null;

  const popoverClasses = [styles.popover, className].filter(Boolean).join(' ');

  return createPortal(
    <>
      {/* Backdrop */}
      <div className={styles.backdrop} onClick={onClose} />
      
      {/* Popover */}
      <div
        ref={popoverRef}
        className={popoverClasses}
        data-theme="dark"
        style={{
          position: 'fixed',
          top: `${position.top}px`,
          left: `${position.left}px`,
          zIndex: 1000,
        }}
      >
        {viewState === 'create' ? (
          // ========== CREATE STATE ==========
          <>
            <div className={styles.content}>
              <div className={styles.headerSimple}>
                <p className={styles.title}>Nome da categoria</p>
              </div>
              <div className={styles.inputContainer}>
                <input
                  ref={inputRef}
                  type="text"
                  className={styles.input}
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Ex: Trabalho, Casa, Saúde..."
                />
              </div>
            </div>

            <div className={styles.footerCreate}>
              <Button
                variant="ghost"
                size="small"
                onClick={handleCancelCreate}
                className={styles.cancelButton}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="small"
                onClick={handleCreate}
                disabled={!newCategoryName.trim()}
                className={styles.createButton}
              >
                Criar
              </Button>
            </div>
          </>
        ) : isEmpty ? (
          // ========== EMPTY STATE ==========
          <>
            <div className={styles.contentEmpty}>
              <div className={styles.headerWithIcon}>
                <Ghost size={20} weight="regular" />
                <p className={styles.title}>Nada por aqui ainda</p>
              </div>
              <p className={styles.description}>
                Use categorias para filtrar, priorizar e visualizar melhor o que importa.
              </p>
            </div>

            <div className={styles.footer}>
              <Button
                variant="secondary"
                size="small"
                icon={Plus}
                iconPosition="left"
                onClick={handleNewCategoryClick}
                className={styles.newCategoryButton}
              >
                Nova Categoria
              </Button>
            </div>
          </>
        ) : (
          // ========== FILLED STATE (List) ==========
          <>
            <div className={styles.content}>
              <div className={styles.headerSimple}>
                <p className={styles.title}>Lista de categorias</p>
              </div>
              <div className={styles.categoryList}>
                {categories.map((category) => (
                  <ListItem
                    key={category.id}
                    label={category.name}
                    icon={Hash}
                    onClick={() => handleCategoryClick(category)}
                  />
                ))}
              </div>
            </div>

            <div className={styles.footer}>
              <Button
                variant="secondary"
                size="small"
                icon={Plus}
                iconPosition="left"
                onClick={handleNewCategoryClick}
                className={styles.newCategoryButton}
              >
                Nova Categoria
              </Button>
            </div>
          </>
        )}
      </div>
    </>,
    document.body
  );
}

