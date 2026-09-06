/**
 * ConnectionChip — status pill for a linked account or integration.
 *
 * Trailing “Conectado” on a ListCard. Not a Chip or Badge variant.
 */

import styles from './ConnectionChip.module.css';

export interface ConnectionChipProps {
  label?: string;
  tone?: 'connected' | 'pending';
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function ConnectionChip({
  label,
  tone = 'connected',
  onClick,
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
}: ConnectionChipProps) {
  const text = label ?? (tone === 'pending' ? 'Pendente' : 'Conectado');
  const chipClass = [
    styles.chip,
    tone === 'pending' ? styles.pending : styles.connected,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (onClick) {
    return (
      <button
        type="button"
        className={chipClass}
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel}
      >
        {text}
      </button>
    );
  }

  return <span className={chipClass}>{text}</span>;
}
