import React from 'react';
import styles from './PlaceholderPage.module.css';

export const Finances: React.FC = () => {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Finanças</h1>
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Controle financeiro</h2>
        <p className={styles.body}>
          Seus dados financeiros aparecerão aqui. Funcionalidade em desenvolvimento.
        </p>
      </div>
    </div>
  );
};
