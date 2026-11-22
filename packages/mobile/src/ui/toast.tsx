import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette, radius, spacing } from '@/theme/tokens';
import { Text } from './text';

interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Milliseconds; defaults to 4s (6s when there is an action). */
  duration?: number;
}

interface ToastState extends ToastOptions {
  id: number;
}

const ToastContext = createContext<((options: ToastOptions) => void) | null>(null);

/** Bottom toast for confirmations and undo, styled like the web Sonner toasts. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((options: ToastOptions) => {
    if (timer.current) clearTimeout(timer.current);
    const id = Date.now();
    setToast({ ...options, id });
    timer.current = setTimeout(
      () => setToast((current) => (current?.id === id ? null : current)),
      options.duration ?? (options.onAction ? 6000 : 4000),
    );
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <ToastContext value={show}>
      {children}
      {toast ? (
        <Animated.View
          key={toast.id}
          entering={FadeInDown}
          exiting={FadeOutDown}
          pointerEvents="box-none"
          style={[styles.container, { bottom: insets.bottom + 72 }]}
        >
          <View style={styles.toast} accessibilityLiveRegion="polite" accessibilityRole="alert">
            <Text variant="body-md" style={styles.message}>
              {toast.message}
            </Text>
            {toast.actionLabel && toast.onAction ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => {
                  toast.onAction?.();
                  setToast(null);
                }}
              >
                <Text variant="label-md" style={styles.action}>
                  {toast.actionLabel}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </ToastContext>
  );
}

export function useToast(): (options: ToastOptions) => void {
  const show = use(ToastContext);
  if (!show) throw new Error('useToast must be used within ToastProvider');
  return show;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.gray[950],
  },
  message: {
    flex: 1,
    color: palette.gray[50],
  },
  action: {
    color: palette.brand[300],
  },
});
