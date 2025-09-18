import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { X, CheckCircle, Warning, Info, WarningCircle } from 'phosphor-react';

interface Toast {
  id: string;
  title: string;
  description?: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number;
}

interface ToastContextType {
  toast: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((toastData: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast: Toast = {
      id,
      duration: 5000,
      ...toastData,
    };

    setToasts(prev => [...prev, newToast]);

    // Auto dismiss after duration
    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        dismiss(id);
      }, newToast.duration);
    }
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

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed bottom-10 left-1/2 transform -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setIsLeaving(true);
    setTimeout(() => onDismiss(toast.id), 300);
  };

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600" weight="fill" />;
      case 'error':
        return <WarningCircle className="w-5 h-5 text-red-600" weight="fill" />;
      case 'warning':
        return <Warning className="w-5 h-5 text-yellow-600" weight="fill" />;
      case 'info':
        return <Info className="w-5 h-5 text-blue-600" weight="fill" />;
      default:
        return <CheckCircle className="w-5 h-5 text-green-600" weight="fill" />;
    }
  };

  const getBackgroundColor = () => {
    switch (toast.type) {
      case 'success':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      case 'error':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      case 'warning':
        return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
      case 'info':
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
      default:
        return 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700';
    }
  };

  return (
    <div
      className={`
        pointer-events-auto max-w-sm w-full
        transform transition-all duration-300 ease-out
        ${isVisible && !isLeaving 
          ? 'translate-y-0 opacity-100 scale-100' 
          : 'translate-y-2 opacity-0 scale-95'
        }
        ${getBackgroundColor()}
        border rounded-lg shadow-lg p-4
      `}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {getIcon()}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {toast.title}
          </div>
          {toast.description && (
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {toast.description}
            </div>
          )}
          
          {toast.action && (
            <div className="mt-3">
              <button
                onClick={() => {
                  toast.action?.onClick();
                  handleDismiss();
                }}
                className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
              >
                {toast.action.label}
              </button>
            </div>
          )}
        </div>
        
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
        >
          <X className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
        </button>
      </div>
    </div>
  );
};

// Global toast instance - will be set by the provider
let globalToast: ((toast: Omit<Toast, 'id'>) => void) | null = null;

// Set the global toast function
export const setGlobalToast = (toastFn: (toast: Omit<Toast, 'id'>) => void) => {
  globalToast = toastFn;
};

// Convenience functions for easy usage
export const toast = {
  success: (title: string, options?: Omit<Toast, 'id' | 'title' | 'type'>) => {
    if (globalToast) {
      globalToast({ title, type: 'success', ...options });
    }
  },
  error: (title: string, options?: Omit<Toast, 'id' | 'title' | 'type'>) => {
    if (globalToast) {
      globalToast({ title, type: 'error', ...options });
    }
  },
  warning: (title: string, options?: Omit<Toast, 'id' | 'title' | 'type'>) => {
    if (globalToast) {
      globalToast({ title, type: 'warning', ...options });
    }
  },
  info: (title: string, options?: Omit<Toast, 'id' | 'title' | 'type'>) => {
    if (globalToast) {
      globalToast({ title, type: 'info', ...options });
    }
  },
};
