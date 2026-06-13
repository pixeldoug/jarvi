import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ChangelogEntry } from '../../novidades/changelog.data';
import styles from './ChangelogLayout.module.css';

interface ChangelogLayoutProps {
  entries: ChangelogEntry[];
  children: ReactNode;
}

export function ChangelogLayout({ entries, children }: ChangelogLayoutProps) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
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

      <div className={styles.body}>
        <aside className={styles.toc}>
          <div className={styles.tocInner}>
            <p className={styles.tocTitle}>Índice</p>
            <nav>
              <ul className={styles.tocList}>
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <a href={`#${entry.id}`} className={styles.tocLink}>
                      {entry.date}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </aside>

        <main className={styles.main}>
          {children}
        </main>
      </div>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
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
