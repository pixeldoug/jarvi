import React from 'react';
import styles from './PlaceholderPage.module.css';

export const Habits: React.FC = () => {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Hábitos</h1>
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Rastreamento de hábitos</h2>
        <p className={styles.body}>
          Seus hábitos aparecerão aqui. Funcionalidade em desenvolvimento.
        </p>
      </div>
    </div>
  );
};
