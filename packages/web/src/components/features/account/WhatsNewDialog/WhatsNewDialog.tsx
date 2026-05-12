import { Dialog } from '../../../ui/Dialog/Dialog';
import { CHANGELOG_ENTRIES, EMOJI_MAP } from '../../../../data/changelog';
import styles from './WhatsNewDialog.module.css';

interface WhatsNewDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const VISIBLE_ENTRIES = CHANGELOG_ENTRIES.slice(0, 3);

export function WhatsNewDialog({ isOpen, onClose }: WhatsNewDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="O que há de novo"
      width="md"
    >
      <div className={styles.entries}>
        {VISIBLE_ENTRIES.map((entry, i) => (
          <div key={entry.version} className={styles.entry} data-first={i === 0 || undefined}>
            <div className={styles.entryHeader}>
              {entry.title && (
                <h3 className={styles.entryTitle}>{entry.title}</h3>
              )}
              <span className={styles.entryDate}>{entry.date}</span>
            </div>

            <ul className={styles.itemList}>
              {entry.items.map((item, j) => (
                <li key={j} className={styles.item}>
                  <span className={styles.itemEmoji} aria-hidden="true">
                    {EMOJI_MAP[item.type]}
                  </span>
                  <span className={styles.itemText}>{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        <a
          href="https://jarvi.app/novidades"
          target="_blank"
          rel="noreferrer"
          className={styles.allUpdatesLink}
        >
          Ver todas as atualizações →
        </a>
      </div>
    </Dialog>
  );
}
