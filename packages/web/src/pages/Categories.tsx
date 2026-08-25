import React from 'react';
import { CategoryManager } from '../components/features/categories';
import styles from './PlaceholderPage.module.css';

export const Categories: React.FC = () => {
  return (
    <div className={`${styles.page} ${styles.fullWidth}`}>
      <CategoryManager />
    </div>
  );
};
