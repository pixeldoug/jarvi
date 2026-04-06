/**
 * AppearancePage - Jarvi Web
 *
 * Settings page for dark mode toggle + background image selection.
 * Preview cards reflect the toggled theme in real-time via data-theme attribute.
 *
 * Figma: https://figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-App?node-id=40001338-217221
 */

import { Check } from '@phosphor-icons/react';
import { Switch, Divider } from '../../../../ui';
import { useTheme } from '../../../../../contexts/ThemeContext';
import {
  useBackground,
  BACKGROUND_OPTIONS,
  type BackgroundId,
} from '../../../../../contexts/BackgroundContext';
import styles from './AppearancePage.module.css';

// ============================================================================
// COMPONENT
// ============================================================================

export function AppearancePage() {
  const { isDark, toggleTheme } = useTheme();
  const { backgroundId, setBackground } = useBackground();

  return (
    <div className={styles.page}>
      {/* Dark mode toggle row */}
      <div className={styles.toggleRow}>
        <Switch
          checked={isDark}
          onChange={toggleTheme}
          aria-labelledby="dark-mode-label"
        />
        <span id="dark-mode-label" className={styles.toggleLabel}>
          Ativar modo escuro
        </span>
      </div>

      <Divider />

      {/* Background picker */}
      <h2 className={styles.sectionTitle}>Escolher imagem de fundo</h2>

      <div className={styles.grid}>
        {BACKGROUND_OPTIONS.map((bg) => (
          <BackgroundCard
            key={bg.id}
            bg={bg}
            selected={backgroundId === bg.id}
            isDark={isDark}
            onSelect={setBackground}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// BACKGROUND CARD
// ============================================================================

interface BackgroundCardProps {
  bg: { id: BackgroundId; src: string | undefined };
  selected: boolean;
  isDark: boolean;
  onSelect: (id: BackgroundId) => void;
}

function BackgroundCard({ bg, selected, isDark, onSelect }: BackgroundCardProps) {
  return (
    <button
      type="button"
      className={`${styles.card} ${selected ? styles.cardSelected : ''}`}
      onClick={() => onSelect(bg.id)}
      aria-pressed={selected}
      aria-label={`Fundo ${bg.id}`}
    >
      {/* Background image / solid dark */}
      {bg.src ? (
        <img src={bg.src} alt="" className={styles.cardBg} aria-hidden="true" />
      ) : (
        <div className={styles.cardBgDark} aria-hidden="true" />
      )}

      {/* Mini layout preview — data-theme drives the CSS token cascade */}
      <div className={styles.miniLayout} data-theme={isDark ? 'dark' : 'light'}>
        {/* Mini sidebar */}
        <div className={styles.miniSidebar}>
          <div className={styles.miniAccentBar} />
        </div>

        {/* Mini main area */}
        <div className={styles.miniMain}>
          <div className={styles.miniLine} />
          <div className={styles.miniLine} />
          <div className={styles.miniLine} />
          <div className={styles.miniLine} />
        </div>
      </div>

      {/* Selected checkmark badge */}
      {selected && (
        <span className={styles.checkBadge} aria-hidden="true">
          <Check size={14} weight="bold" />
        </span>
      )}
    </button>
  );
}
