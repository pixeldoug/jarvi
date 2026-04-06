/**
 * Tooltip Component - Jarvi Web
 *
 * Figma: https://www.figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-App?node-id=40000374-1509
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import styles from './Tooltip.module.css';

// ============================================================================
// TYPES
// ============================================================================

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  label: string;
  position?: TooltipPosition;
  children: React.ReactNode;
  showDelay?: number;
  hideDelay?: number;
  disabled?: boolean;
  className?: string;
}

// ============================================================================
// POINTER SVGS — one per direction
// ============================================================================

function PointerSvg({ position }: { position: TooltipPosition }) {
  switch (position) {
    // ▼ points down (container is above)
    case 'bottom':
      return (
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
          <path d="M5 6L0 0H10L5 6Z" fill="currentColor" />
        </svg>
      );
    // ▲ points up (container is below)
    case 'top':
      return (
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
          <path d="M5 0L10 6H0L5 0Z" fill="currentColor" />
        </svg>
      );
    // ◄ points left (container is to the right)
    case 'right':
      return (
        <svg width="8" height="16" viewBox="0 0 8 16" fill="none" aria-hidden="true">
          <path d="M0 8L8 0V16L0 8Z" fill="currentColor" />
        </svg>
      );
    // ► points right (container is to the left)
    case 'left':
      return (
        <svg width="8" height="16" viewBox="0 0 8 16" fill="none" aria-hidden="true">
          <path d="M8 8L0 0V16L8 8Z" fill="currentColor" />
        </svg>
      );
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export function Tooltip({
  label,
  position = 'bottom',
  children,
  showDelay = 200,
  hideDelay = 0,
  disabled = false,
  className = '',
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const showTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const gap = 6;

    let top = 0;
    let left = 0;

    switch (position) {
      case 'top':
        top  = triggerRect.top - tooltipRect.height - gap;
        left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
        break;
      case 'bottom':
        top  = triggerRect.bottom + gap;
        left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
        break;
      case 'left':
        top  = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
        left = triggerRect.left - tooltipRect.width - gap;
        break;
      case 'right':
        top  = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
        left = triggerRect.right + gap;
        break;
    }

    const margin = 8;
    left = Math.max(margin, Math.min(left, window.innerWidth  - tooltipRect.width  - margin));
    top  = Math.max(margin, Math.min(top,  window.innerHeight - tooltipRect.height - margin));

    setCoords({ top, left });
  }, [position]);

  const handleShow = useCallback(() => {
    if (disabled) return;
    if (hideTimeoutRef.current) { clearTimeout(hideTimeoutRef.current); hideTimeoutRef.current = null; }
    showTimeoutRef.current = setTimeout(() => setIsVisible(true), showDelay);
  }, [disabled, showDelay]);

  const handleHide = useCallback(() => {
    if (showTimeoutRef.current) { clearTimeout(showTimeoutRef.current); showTimeoutRef.current = null; }
    hideTimeoutRef.current = setTimeout(() => { setIsVisible(false); setCoords(null); }, hideDelay);
  }, [hideDelay]);

  useEffect(() => {
    if (!isVisible) return;
    requestAnimationFrame(updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isVisible, updatePosition]);

  useEffect(() => () => {
    if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
  }, []);

  const tooltipClasses = [styles.tooltip, styles[position], className].filter(Boolean).join(' ');

  return (
    <>
      <span
        ref={triggerRef}
        className={styles.trigger}
        onMouseEnter={handleShow}
        onMouseLeave={handleHide}
        onFocus={handleShow}
        onBlur={handleHide}
      >
        {children}
      </span>

      {isVisible &&
        createPortal(
          <div
            ref={tooltipRef}
            className={tooltipClasses}
            role="tooltip"
            style={{
              position:   'fixed',
              top:        coords?.top  ?? -9999,
              left:       coords?.left ?? -9999,
              visibility: coords ? 'visible' : 'hidden',
            }}
          >
            <div className={styles.container}>
              <span className={styles.label}>{label}</span>
            </div>
            <div className={styles.pointer}>
              <PointerSvg position={position} />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
