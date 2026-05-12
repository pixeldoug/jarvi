import { CHANGELOG_ENTRIES, EMOJI_MAP } from './changelog.data';
import styles from './novidades.module.css';

export default function NovidadesPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Jarvi Changelog – Novidades',
    description: 'Lista de atualizações da Jarvi: novas funcionalidades, melhorias e correções.',
    numberOfItems: CHANGELOG_ENTRIES.length,
    itemListElement: CHANGELOG_ENTRIES.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.title ?? entry.date,
      description: entry.items.map((item) => item.text).join(' '),
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className={styles.intro}>
        <h1 className={styles.pageTitle}>Novidades da Jarvi</h1>
        <p className={styles.pageSubtitle}>
          Todas as atualizações — desde grandes funcionalidades até pequenos ajustes.
          Feitas a partir das suas ideias e feedbacks.
        </p>
      </div>

      <div className={styles.entries}>
        {CHANGELOG_ENTRIES.map((entry) => (
          <section key={entry.id} id={entry.id} className={styles.entry}>
            <div className={styles.entryHeader}>
              <time dateTime={entry.isoDate} className={styles.entryDate}>
                {entry.date}
              </time>
              {entry.title && (
                <h2 className={styles.entryTitle}>{entry.title}</h2>
              )}
            </div>

            <ul className={styles.itemList}>
              {entry.items.map((item, i) => (
                <li key={i} className={styles.item} data-type={item.type}>
                  <span className={styles.itemEmoji} aria-hidden="true">
                    {EMOJI_MAP[item.type]}
                  </span>
                  <span
                    className={styles.itemText}
                    dangerouslySetInnerHTML={{ __html: item.text }}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
