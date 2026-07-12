import { useState } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import styles from './ThinkingBlock.module.css';

export interface ThinkingBlockProps {
  /** True while the assistant turn is still in progress. */
  isLive?: boolean;
  /** Latest pipeline status (setup, tool execution, etc.). */
  status?: string;
  /** In-progress reasoning segment for the current iteration. */
  reasoning?: string;
  /** Completed reasoning segments from earlier iterations in this turn. */
  reasoningSegments?: string[];
  /** Initial expand state once the turn completes. */
  defaultExpanded?: boolean;
}

function getAllSegments(reasoning?: string, reasoningSegments?: string[]): string[] {
  const segments = [...(reasoningSegments ?? [])];
  if (reasoning?.trim()) {
    segments.push(reasoning);
  }
  return segments.filter((segment) => segment.trim().length > 0);
}

export function ThinkingBlock({
  isLive = false,
  status,
  reasoning,
  reasoningSegments,
  defaultExpanded = false,
}: ThinkingBlockProps) {
  const segments = getAllSegments(reasoning, reasoningSegments);
  const hasReasoning = segments.length > 0;
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (!isLive && !hasReasoning && !status) {
    return null;
  }

  const label = isLive ? 'Pensando…' : 'Pensamento';

  return (
    <div className={styles.block}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setIsExpanded((open) => !open)}
        aria-expanded={isExpanded}
        disabled={!hasReasoning && !status}
      >
        <CaretDown
          size={14}
          weight="bold"
          className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ''}`}
          aria-hidden
        />
        <span className={`${styles.label} ${isLive ? styles.labelLive : ''}`}>{label}</span>
      </button>

      {isExpanded && (
        <div className={styles.body}>
          {status && <p className={styles.status}>{status}</p>}
          {hasReasoning && (
            <div className={styles.reasoningList}>
              {segments.map((segment, index) => (
                <div key={index} className={styles.reasoningSegment}>
                  {segments.length > 1 && (
                    <span className={styles.reasoningStep}>Etapa {index + 1}</span>
                  )}
                  <p className={styles.reasoningText}>{segment}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
