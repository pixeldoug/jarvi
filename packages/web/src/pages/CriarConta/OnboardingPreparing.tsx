import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check } from '@phosphor-icons/react';
import styles from './CriarConta.module.css';

const WORK_STEPS = [
  'Entendendo o que você tem em mente...',
  'Criando sua primeira tarefa...',
  'Configurando seu agente...',
  'Organizando os próximos passos...',
] as const;

const PREPARING_TITLE = 'Preparando tudo para você...';
const READY_TITLE = 'Tudo pronto. Vamos começar.';
const READY_LABEL = 'Tudo pronto';

const STEP_DELAY_MS = 1200;
const READY_HOLD_MS = 900;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function delay(ms: number, signal: { cancelled: boolean }): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      if (!signal.cancelled) resolve();
    }, ms);
  });
}

export interface OnboardingPreparingProps {
  isBackendReady: boolean;
  onReady: () => void;
}

export function OnboardingPreparing({ isBackendReady, onReady }: OnboardingPreparingProps) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [showReady, setShowReady] = useState(false);
  const backendReadyRef = useRef(isBackendReady);
  const onReadyRef = useRef(onReady);

  backendReadyRef.current = isBackendReady;
  onReadyRef.current = onReady;

  useEffect(() => {
    const signal = { cancelled: false };

    const run = async () => {
      const reduced = prefersReducedMotion();

      if (reduced) {
        setVisibleCount(WORK_STEPS.length);
        while (!backendReadyRef.current && !signal.cancelled) {
          await delay(80, signal);
        }
        if (signal.cancelled) return;
        setShowReady(true);
        await delay(280, signal);
        if (!signal.cancelled) onReadyRef.current();
        return;
      }

      for (let i = 0; i < WORK_STEPS.length; i += 1) {
        if (signal.cancelled) return;
        setVisibleCount(i + 1);
        await delay(STEP_DELAY_MS, signal);
        if (signal.cancelled) return;
        if (backendReadyRef.current) break;
      }

      while (!backendReadyRef.current && !signal.cancelled) {
        await delay(80, signal);
      }
      if (signal.cancelled) return;

      setShowReady(true);
      await delay(READY_HOLD_MS, signal);
      if (!signal.cancelled) onReadyRef.current();
    };

    void run();
    return () => {
      signal.cancelled = true;
    };
  }, []);

  const title = showReady ? READY_TITLE : PREPARING_TITLE;

  return (
    <div
      className={styles.preparing}
      role="status"
      aria-live="polite"
      aria-busy={!showReady}
    >
      <div className={styles.questionBlock}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.h1
            key={title}
            className={styles.preparingTitle}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          >
            {title}
          </motion.h1>
        </AnimatePresence>
      </div>

      <ul className={styles.preparingList}>
        <AnimatePresence initial={false}>
          {WORK_STEPS.slice(0, visibleCount).map((step, index) => {
            const isCurrent = !showReady && index === visibleCount - 1;
            return (
              <motion.li
                key={step}
                className={styles.preparingItem}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: isCurrent ? 1 : 0.55, y: 0 }}
                transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
              >
                <span className={styles.preparingPill}>
                  <ArrowRight size={14} weight="bold" aria-hidden="true" />
                  <span>{step}</span>
                </span>
              </motion.li>
            );
          })}
          {showReady ? (
            <motion.li
              key="ready"
              className={styles.preparingItem}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            >
              <span className={styles.preparingPillReady}>
                <ArrowRight size={14} weight="bold" aria-hidden="true" />
                <span>{READY_LABEL}</span>
                <Check size={14} weight="bold" aria-hidden="true" />
              </span>
            </motion.li>
          ) : null}
        </AnimatePresence>
      </ul>
    </div>
  );
}
