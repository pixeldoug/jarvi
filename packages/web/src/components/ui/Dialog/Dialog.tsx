/**
 * Dialog Component - Jarvi Web
 * 
 * Global reusable dialog component with overlay, portal, and close button
 * Following JarviDS design system from Figma
 * 
 * Figma: https://figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-Web
 * Node: 40000506-20916
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import styles from './Dialog.module.css';

export interface DialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when the dialog should close */
  onClose: () => void;
  /** Dialog title */
  title?: string;
  /** Dialog content */
  children: ReactNode;
  /** Dialog width preset */
  width?: 'sm' | 'md' | 'lg' | 'xl';
  /** Additional CSS classes for the dialog container */
  className?: string;
  /** Whether to show the close button */
  showCloseButton?: boolean;
  /** Force a specific theme inside the dialog subtree */
  forceTheme?: 'light' | 'dark';
  /** Additional CSS classes for the dialog content wrapper */
  contentClassName?: string;
}

export function Dialog({
  isOpen,
  onClose,
  title,
  children,
  width = 'lg',
  className = '',
  showCloseButton = true,
  forceTheme,
  contentClassName = '',
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Handle Escape key
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

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        e.target instanceof Element &&
        e.target.closest('[data-dialog-outside-click-ignore="true"]')
      ) {
        return;
      }

      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
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
  }, [isOpen, onClose]);

  // Prevent body scroll when dialog is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const dialogClasses = [
    styles.dialog,
    styles[width],
    className,
  ].filter(Boolean).join(' ');
  const contentClasses = [styles.content, contentClassName].filter(Boolean).join(' ');

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true" data-theme={forceTheme}>
      <div ref={dialogRef} className={dialogClasses}>
        {/* Close Button */}
        {showCloseButton && (
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Fechar"
          >
            <X size={20} weight="regular" />
          </button>
        )}

        {/* Title */}
        {title && (
          <h2 className={styles.title}>{title}</h2>
        )}

        {/* Content */}
        <div className={contentClasses}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
