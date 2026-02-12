/**
 * Dropdown Component - Jarvi Web
 * 
 * A flexible, reusable dropdown component that can be positioned
 * relative to any trigger element and accepts any children content.
 * 
 * Figma: https://figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-Web
 * Node: 40000504-20845
 */

import { useRef, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Dropdown.module.css';

export interface DropdownProps {
  /** Whether the dropdown is open */
  isOpen: boolean;
  /** Callback when the dropdown should close */
  onClose: () => void;
  /** Anchor element reference for positioning */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Dropdown content */
  children: ReactNode;
  /** Optional title in the header */
  title?: string;
  /** Optional button section rendered below content */
  buttonSection?: ReactNode;
  /** Dropdown width (number for px, string for any CSS value) */
  width?: number | string;
  /** Horizontal alignment relative to anchor */
  align?: 'left' | 'right' | 'center';
  /** Vertical position preference */
  position?: 'top' | 'bottom' | 'auto';
  /** Additional CSS classes */
  className?: string;
  /** Gap between anchor and dropdown */
  gap?: number;
  /** Force dropdown token theme */
  forceTheme?: 'light' | 'dark';
}

interface Position {
  top: number;
  left: number;
}

export function Dropdown({
  isOpen,
  onClose,
  anchorRef,
  children,
  title,
  buttonSection,
  width = 256,
  align = 'left',
  position = 'auto',
  className = '',
  gap = 8,
  forceTheme,
}: DropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [calculatedPosition, setCalculatedPosition] = useState<Position | null>(null);

  // Calculate dropdown position
  useEffect(() => {
    if (!isOpen || !anchorRef?.current) {
      setCalculatedPosition(null);
      return;
    }

    const updatePosition = () => {
      if (!anchorRef?.current) return;

      const anchorRect = anchorRef.current.getBoundingClientRect();
      const dropdownWidth = typeof width === 'number' ? width : dropdownRef.current?.offsetWidth || 256;
      const dropdownHeight = dropdownRef.current?.offsetHeight || 200;
      const margin = 16;

      // Calculate vertical position
      let top: number;
      const spaceBelow = window.innerHeight - anchorRect.bottom - margin;
      const spaceAbove = anchorRect.top - margin;

      if (position === 'bottom' || (position === 'auto' && spaceBelow >= dropdownHeight)) {
        // Position below
        top = anchorRect.bottom + gap;
      } else if (position === 'top' || (position === 'auto' && spaceAbove >= dropdownHeight)) {
        // Position above
        top = anchorRect.top - dropdownHeight - gap;
      } else {
        // Default to below if neither fits well
        top = anchorRect.bottom + gap;
      }

      // Calculate horizontal position based on alignment
      let left: number;
      switch (align) {
        case 'right':
          left = anchorRect.right - dropdownWidth;
          break;
        case 'center':
          left = anchorRect.left + (anchorRect.width - dropdownWidth) / 2;
          break;
        case 'left':
        default:
          left = anchorRect.left;
          break;
      }

      // Adjust horizontally if goes off screen
      if (left + dropdownWidth > window.innerWidth - margin) {
        left = window.innerWidth - dropdownWidth - margin;
      }
      if (left < margin) {
        left = margin;
      }

      // Ensure doesn't go off screen vertically
      top = Math.max(margin, Math.min(top, window.innerHeight - dropdownHeight - margin));

      setCalculatedPosition({ top, left });
    };

    // Calculate immediately
    updatePosition();

    // Recalculate when dropdown has real dimensions
    const timeoutId = setTimeout(updatePosition, 10);

    // Recalculate on resize and scroll
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, anchorRef, width, align, position, gap]);

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
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

  if (!isOpen || !calculatedPosition) return null;

  const dropdownClasses = [styles.dropdown, className].filter(Boolean).join(' ');
  const dropdownWidth = typeof width === 'number' ? `${width}px` : width;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={styles.backdrop}
        data-dialog-outside-click-ignore="true"
        onClick={onClose}
      />
      
      {/* Dropdown */}
      <div
        ref={dropdownRef}
        className={dropdownClasses}
        data-dialog-outside-click-ignore="true"
        data-theme={forceTheme}
        style={{
          position: 'fixed',
          top: `${calculatedPosition.top}px`,
          left: `${calculatedPosition.left}px`,
          width: dropdownWidth,
          zIndex: 1000,
        }}
        role="menu"
        aria-orientation="vertical"
      >
        {/* Optional Header */}
        {title && (
          <div className={styles.header}>
            <p className={styles.title}>{title}</p>
          </div>
        )}

        {/* Content */}
        <div className={styles.content}>
          {children}
        </div>

        {/* Optional Button Section */}
        {buttonSection && (
          <div className={styles.buttonSection}>
            {buttonSection}
          </div>
        )}
      </div>
    </>,
    document.body
  );
}
