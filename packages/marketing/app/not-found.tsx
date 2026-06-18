import Link from 'next/link';

import styles from './error.module.css';

export default function NotFound() {
  return (
    <div className={styles.container}>
      <img
        src="/assets/icons/logo-icon.svg"
        alt="Jarvi"
        className={styles.logo}
        aria-hidden="true"
      />
      <h1 className={styles.title}>Página não encontrada</h1>
      <p className={styles.description}>
        A página que você procura não existe ou foi movida.
      </p>
      <div className={styles.actions}>
        <Link href="/" className={styles.primaryButton}>
          Voltar para o início
        </Link>
      </div>
    </div>
  );
}
