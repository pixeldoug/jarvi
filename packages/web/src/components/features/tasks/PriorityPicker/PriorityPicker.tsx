/**
 * PriorityPicker Component - Jarvi Web
 * 
 * Priority picker dropdown for task creation/editing
 * Based on Figma node 40000407:20260
 */

import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Fire } from '@phosphor-icons/react';
import styles from './PriorityPicker.module.css';

export type Priority = 'low' | 'medium' | 'high';

export interface PriorityPickerProps {
  /** Whether the popover is open */
  isOpen: boolean;
  /** Callback when the popover should close */
  onClose: () => void;
  /** Currently selected priority */
  selectedPriority?: Priority;
  /** Callback when a priority is selected */
  onPrioritySelect: (priority: Priority) => void;
  /** Anchor element reference for positioning */
  anchorRef?: React.RefObject<HTMLElement>;
  /** Additional CSS classes */
  className?: string;
}

interface PriorityOption {
  id: Priority;
  label: string;
  color: string;
}

const PRIORITY_OPTIONS: PriorityOption[] = [
  {
    id: 'high',
    label: 'Urgente',
    color: '#F87171', // Red
  },
  {
    id: 'medium',
    label: 'Média',
    color: '#FCD34D', // Yellow
  },
  {
    id: 'low',
    label: 'Baixa',
    color: '#60A5FA', // Blue
  },
];

export function PriorityPicker({
  isOpen,
  onClose,
  selectedPriority,
  onPrioritySelect,
  anchorRef,
  className = '',
}: PriorityPickerProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  // Calculate popover position
  useEffect(() => {
    if (!isOpen || !anchorRef?.current) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      if (!anchorRef?.current) return;

      const rect = anchorRef.current.getBoundingClientRect();
      const popoverWidth = 256; // ~240px + padding
      const popoverHeight = popoverRef.current?.offsetHeight || 220;
      const gap = 8;
      const margin = 16;

      // Position above the chip by default
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
  }, [isOpen, anchorRef]);

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

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handlePriorityClick = (priority: Priority) => {
    onPrioritySelect(priority);
    onClose();
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
        {/* Header */}
        <div className={styles.header}>
          <p className={styles.title}>Defina uma prioridade</p>
        </div>

        {/* Options */}
        <div className={styles.options}>
          {PRIORITY_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`${styles.option} ${selectedPriority === option.id ? styles.selected : ''}`}
              onClick={() => handlePriorityClick(option.id)}
            >
              <Fire 
                size={16} 
                weight="fill" 
                style={{ color: option.color }}
              />
              <span className={styles.optionLabel}>{option.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>,
    document.body
  );
}


