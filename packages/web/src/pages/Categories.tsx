import React from 'react';
import { CategoryManager } from '../components/CategoryManager';

export const Categories: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <CategoryManager />
    </div>
  );
};
