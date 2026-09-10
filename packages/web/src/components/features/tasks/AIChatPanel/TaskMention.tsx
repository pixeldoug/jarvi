import type { MouseEvent } from 'react';
import taskArtifactIcon from '../../../../assets/icons/task-artifact.svg';
import styles from './AIChatPanel.module.css';

interface TaskMentionProps {
  title: string;
  size?: 'inline' | 'header';
  onClick?: () => void;
}

export function TaskMention({ title, size = 'inline', onClick }: TaskMentionProps) {
  const className = [
    styles.taskMention,
    size === 'header' ? styles.taskMentionHeader : '',
    onClick ? styles.taskMentionClickable : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handleClick = (event: MouseEvent) => {
    if (!onClick) return;
    event.preventDefault();
    onClick();
  };

  const body = (
    <>
      <span className={styles.taskMentionIcon} aria-hidden>
        <img src={taskArtifactIcon} alt="" width={10} height={10} />
      </span>
      <span className={styles.taskMentionTitle}>{title}</span>
    </>
  );

  if (onClick && size === 'header') {
    return (
      <button type="button" className={className} onClick={handleClick}>
        {body}
      </button>
    );
  }

  if (onClick) {
    return (
      <span
        className={className}
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClick();
          }
        }}
      >
        {body}
      </span>
    );
  }

  return <span className={className}>{body}</span>;
}
