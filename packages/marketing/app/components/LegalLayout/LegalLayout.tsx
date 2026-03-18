import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './LegalLayout.module.css';

interface LegalLayoutProps {
  children: ReactNode;
}

export function LegalLayout({ children }: LegalLayoutProps) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.container}>
          <Link href="/" className={styles.brand}>
            <div className={styles.logoBox}>
              <img
                src="/assets/icons/logo-icon.svg"
                alt=""
                aria-hidden="true"
                width={22}
                height={25}
              />
            </div>
            <span>Jarvi</span>
          </Link>

          <Link href="/" className={styles.backLink}>
            ← Voltar ao site
          </Link>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.container}>
          <article className={styles.prose}>{children}</article>
        </div>
      </main>

      <footer className={styles.footer}>
        <div className={styles.container}>
          <p>
            2026 – Uma empresa desenvolvida por{' '}
            <a href="https://strides.digital" target="_blank" rel="noreferrer">
              Strides Digital
            </a>
          </p>
          <div className={styles.footerLinks}>
            <Link href="/termos-de-uso">Termos de Uso</Link>
            <Link href="/politica-de-privacidade">Política de Privacidade</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
