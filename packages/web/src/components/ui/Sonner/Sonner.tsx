/**
 * Sonner Component - Jarvi Web
 * 
 * Toast notification component following JarviDS design system
 * Based on Figma node 40000310:12002
 * 
 * Displays toasts 16px above the ControlBar
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { X } from '@phosphor-icons/react';
import styles from './Sonner.module.css';

// ============================================================================
// TYPES
// ============================================================================

interface Toast {
  id: string;
  label: string;
  hasButton?: boolean;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextType {
  toast: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

// ============================================================================
// CONTEXT
// ============================================================================

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

// ============================================================================
// PROVIDER
// ============================================================================

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((toastData: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast: Toast = {
      id,
      duration: 1500, // 1.5 seconds default
      ...toastData,
    };

    setToasts(prev => [...prev, newToast]);

    // Auto dismiss is now handled by ToastItem component
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  // Set global toast function
  useEffect(() => {
    setGlobalToast(toast);
  }, [toast]);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
};

// ============================================================================
// TOAST CONTAINER
// ============================================================================

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [bottomPosition, setBottomPosition] = useState<string>('calc(24px + 672px + 16px)');

  // Calculate position dynamically based on ControlBar
  useEffect(() => {
    const updatePosition = () => {
      // Find ControlBar element
      const controlBar = document.querySelector('[data-control-bar]') as HTMLElement;
      if (controlBar) {
        const controlBarRect = controlBar.getBoundingClientRect();
        // ControlBar is positioned at bottom: 24px (from CSS)
        // Toast should be positioned 16px above the ControlBar
        // Calculate: ControlBar bottom (24px) + ControlBar height + gap (16px)
        const controlBarBottomOffset = 24; // From ControlBar CSS: bottom: 24px
        const controlBarHeight = controlBarRect.height;
        const gap = 16; // 16px gap (fixed as requested)
        
        const toastBottom = controlBarBottomOffset + controlBarHeight + gap;
        setBottomPosition(`${toastBottom}px`);
      } else {
        // Fallback if ControlBar not found
        setBottomPosition('calc(24px + 80px + 16px)'); // 24px (bottom) + ~80px (height) + 16px (gap)
      }
    };

    // Initial calculation with a small delay to ensure ControlBar is rendered
    const timeoutId = setTimeout(updatePosition, 100);
    
    // Recalculate on resize and when toasts change
    window.addEventListener('resize', updatePosition);
    // Also recalculate when ControlBar might change size (e.g., mode change)
    const observer = new MutationObserver(updatePosition);
    const controlBar = document.querySelector('[data-control-bar]');
    if (controlBar) {
      observer.observe(controlBar, { attributes: true, childList: true, subtree: true });
    }

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updatePosition);
      observer.disconnect();
    };
  }, [toasts.length]); // Recalculate when toasts change

  if (toasts.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className={styles.toastContainer}
      style={{ bottom: bottomPosition }}
      data-theme="dark"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

// ============================================================================
// TOAST ITEM
// ============================================================================

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  const [animationState, setAnimationState] = useState<'entering' | 'visible' | 'leaving'>('entering');
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPausedRef = useRef(false); // Ref para acessar o valor atual de isPaused no intervalo

  // Trigger entrance animation
  useEffect(() => {
    const timer = setTimeout(() => setAnimationState('visible'), 10);
    return () => clearTimeout(timer);
  }, []);

  // Auto-close and progress bar animation
  useEffect(() => {
    if (animationState !== 'visible' || isDismissed) return;

    const duration = toast.duration || 1500; // 1.5 seconds default
    const interval = 16; // ~60fps
    const steps = duration / interval;
    const increment = 100 / steps;

    // Start progress animation
    progressIntervalRef.current = setInterval(() => {
      // Usar ref para acessar o valor atual de isPaused
      if (!isPausedRef.current && !isDismissed) {
        setProgress(prev => {
          const newProgress = prev + increment;
          if (newProgress >= 100) {
            // Auto-close when progress reaches 100%
            setIsDismissed(true);
            setAnimationState('leaving');
            setTimeout(() => onDismiss(toast.id), 300);
            return 100;
          }
          return newProgress;
        });
      }
    }, interval);

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, [animationState, toast.duration, toast.id, onDismiss, isDismissed]);

  const handleDismiss = () => {
    setIsDismissed(true);
    isPausedRef.current = true; // Pausar ao fechar manualmente
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setAnimationState('leaving');
    setTimeout(() => onDismiss(toast.id), 300);
  };

  const handleMouseEnter = () => {
    setIsPaused(true);
    isPausedRef.current = true; // Pausar a animação
  };

  const handleMouseLeave = () => {
    setIsPaused(false);
    isPausedRef.current = false; // Retomar a animação
    // Não resetar o progresso - continuar de onde parou
  };

  const handleFocus = () => {
    setIsPaused(true);
    isPausedRef.current = true; // Pausar a animação
  };

  const handleBlur = () => {
    setIsPaused(false);
    isPausedRef.current = false; // Retomar a animação
    // Não resetar o progresso - continuar de onde parou
  };

  const handleViewClick = () => {
    if (toast.action?.onClick) {
      toast.action.onClick();
      // Dismiss toast after clicking view
      handleDismiss();
    }
  };

  const toastClasses = [
    styles.toast,
    styles[animationState],
  ].filter(Boolean).join(' ');

  return (
    <div 
      className={toastClasses}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      tabIndex={0}
    >
      {/* Progress bar */}
      <div 
        className={styles.progressBar}
        style={{ 
          width: `${progress}%`,
          opacity: isPaused ? 0 : 1
        }}
      />
      
      <div className={styles.content}>
        <span className={styles.label}>{toast.label}</span>
        {toast.action && (
          <button
            type="button"
            className={styles.viewButton}
            onClick={handleViewClick}
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        className={styles.closeButton}
        onClick={handleDismiss}
        aria-label="Fechar"
      >
        <X className={styles.closeIcon} weight="regular" />
      </button>
    </div>
  );
};

// ============================================================================
// GLOBAL TOAST API
// ============================================================================

// Global toast instance - will be set by the provider
let globalToast: ((toast: Omit<Toast, 'id'>) => void) | null = null;

// Set the global toast function
export const setGlobalToast = (toastFn: (toast: Omit<Toast, 'id'>) => void) => {
  globalToast = toastFn;
};

// Legacy API for compatibility - maps old API to new structure
interface LegacyToastOptions {
  title?: string;
  description?: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  action?: {
    label: string;
    onClick: () => void;
  };
  hasButton?: boolean;
  duration?: number;
}

// Convenience functions for easy usage
export const toast = {
  success: (title: string, options?: LegacyToastOptions) => {
    if (globalToast) {
      // Use description if provided, otherwise use title
      const label = options?.description || title;
      globalToast({
        label,
        hasButton: options?.hasButton || false,
        duration: options?.duration,
        action: options?.action,
      });
    }
  },
  error: (title: string, options?: LegacyToastOptions) => {
    if (globalToast) {
      const label = options?.description || title;
      globalToast({
        label,
        hasButton: options?.hasButton || false,
        duration: options?.duration,
      });
    }
  },
  warning: (title: string, options?: LegacyToastOptions) => {
    if (globalToast) {
      const label = options?.description || title;
      globalToast({
        label,
        hasButton: options?.hasButton || false,
        duration: options?.duration,
      });
    }
  },
  info: (title: string, options?: LegacyToastOptions) => {
    if (globalToast) {
      const label = options?.description || title;
      globalToast({
        label,
        hasButton: options?.hasButton || false,
        duration: options?.duration,
      });
    }
  },
};

