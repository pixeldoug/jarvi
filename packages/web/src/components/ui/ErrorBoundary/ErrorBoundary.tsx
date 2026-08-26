/**
 * ErrorBoundary Component
 *
 * Catches render-time exceptions in its subtree so a single bad read (e.g. an
 * unguarded `.length` access on undefined data) degrades gracefully instead of
 * crashing the whole React tree. Reports the exception to PostHog so it keeps
 * surfacing in Error Tracking, then renders a recoverable fallback.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import posthog from 'posthog-js';
import { Ghost } from '@phosphor-icons/react';
import { Button } from '../Button';
import styles from './ErrorBoundary.module.css';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback. Receives the error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Extra context attached to the captured exception (e.g. the page name). */
  context?: Record<string, unknown>;
  /**
   * When this value changes, the boundary resets itself. Pass the route path so
   * navigating away from a crashed page clears the error automatically.
   */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    // Reset the boundary when navigating to a different route.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    try {
      posthog.captureException(error, {
        ...this.props.context,
        componentStack: errorInfo.componentStack,
      });
    } catch {
      // Never let error reporting throw inside the boundary.
    }
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;

    if (error) {
      if (this.props.fallback) {
        return this.props.fallback(error, this.reset);
      }

      return (
        <div className={styles.container} role="alert">
          <Ghost size={48} className={styles.icon} weight="regular" aria-hidden="true" />
          <div className={styles.header}>
            <p className={styles.title}>Algo deu errado</p>
            <p className={styles.description}>
              Não foi possível carregar esta página. Tente novamente.
            </p>
          </div>
          <Button variant="primary" size="medium" onClick={this.reset}>
            Tentar novamente
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
