/**
 * BottomSheet Component - Jarvi Web
 *
 * Mobile bottom sheet that slides up from the bottom over a dimmed backdrop.
 * Used on mobile to present content that would otherwise live in a modal/dialog
 * (e.g. settings pages).
 *
 * Figma: https://www.figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-App?node-id=40001672-7359
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { X } from '@phosphor-icons/react';
import styles from './BottomSheet.module.css';

export interface BottomSheetProps {
  /** Whether the sheet is open */
  isOpen: boolean;
  /** Callback when the sheet should close */
  onClose: () => void;
  /** Optional title rendered in the header */
  title?: string;
  /** Sheet content */
  children: ReactNode;
  /** Force a specific theme inside the sheet subtree */
  forceTheme?: 'light' | 'dark';
}

export function BottomSheet({ isOpen, onClose, title, children, forceTheme }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  // Tracks the start Y of a swipe that began with the content already scrolled
  // to the top — used to allow swipe-down-to-close from the content area.
  const contentSwipeStartY = useRef<number | null>(null);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={styles.overlay}
          data-theme={forceTheme}
          role="dialog"
          aria-modal="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(e) => {
            if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
              onClose();
            }
          }}
        >
          <motion.div
            ref={sheetRef}
            className={styles.sheet}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
          >
            {/* Header doubles as a drag handle */}
            <div
              className={styles.header}
              onPointerDown={(e) => dragControls.start(e)}
              style={{ touchAction: 'none', cursor: 'grab' }}
            >
              {title ? <h2 className={styles.title}>{title}</h2> : <span />}
              <button
                type="button"
                className={styles.closeButton}
                onClick={onClose}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label="Fechar"
              >
                <X size={20} weight="regular" />
              </button>
            </div>

            <div
              className={styles.content}
              onTouchStart={(e) => {
                contentSwipeStartY.current =
                  e.currentTarget.scrollTop <= 0 ? e.touches[0].clientY : null;
              }}
              onTouchEnd={(e) => {
                if (contentSwipeStartY.current === null) return;
                const dy = e.changedTouches[0].clientY - contentSwipeStartY.current;
                if (dy > 90) onClose();
                contentSwipeStartY.current = null;
              }}
            >
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
