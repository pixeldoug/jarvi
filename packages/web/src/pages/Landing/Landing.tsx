/**
 * Landing Page - Jarvi Web
 * 
 * Public landing page for marketing and user acquisition
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import styles from './Landing.module.css';

export function Landing() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  // Redirect authenticated users to tasks
  useEffect(() => {
    if (!isLoading && user) {
      navigate('/tasks', { replace: true });
    }
  }, [user, isLoading, navigate]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Carregando...</div>
      </div>
    );
  }

  // Don't render if user is authenticated (will redirect)
  if (user) {
    return null;
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.title}>Jarvi</h1>
        <p className={styles.subtitle}>
          Organize sua vida de forma simples e eficiente
        </p>
        <p className={styles.description}>
          Gerencie tarefas, notas, objetivos e finanças em um só lugar.
        </p>
        
        <div className={styles.cta}>
          <button
            className={styles.ctaButton}
            onClick={() => navigate('/login')}
          >
            Começar Agora
          </button>
        </div>
      </div>
    </div>
  );
}
