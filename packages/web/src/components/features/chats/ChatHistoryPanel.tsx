/**
 * ChatHistoryPanel — the sidebar's Chats panel, next to the icon rail on the
 * Chats page: "Novo chat" and the conversation history, last message first,
 * grouped by day (Hoje / Ontem / …). A row's "…" menu (on hover / focus)
 * deletes the conversation after a confirm.
 */

import { useMemo, useState } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';
import { NotePencil } from '@phosphor-icons/react';
import { ListItem, Skeleton } from '../../ui';
import { useChatsList } from '../../../hooks/useChats';
import type { ChatConversationListItem } from '../../../lib/chatsApi';
import { NoteActionsMenu } from '../notes/NoteActionsMenu';
import { NOTE_DATE_GROUP_LABELS, noteDateGroup, type NoteDateGroup } from '../notes/noteText';
import { DeleteChatDialog } from './DeleteChatDialog';
import styles from './ChatHistoryPanel.module.css';

/** Shown for a conversation whose first message had no text */
export const UNTITLED_CHAT = 'Nova conversa';

const GROUP_ORDER: NoteDateGroup[] = ['today', 'yesterday', 'week', 'older'];

interface ChatGroup {
  key: NoteDateGroup;
  label: string;
  chats: ChatConversationListItem[];
}

/** The list comes sorted (last message first); a day ahead of the server counts as today. */
function groupChats(chats: ChatConversationListItem[], now: Date): ChatGroup[] {
  const byGroup = new Map<NoteDateGroup, ChatConversationListItem[]>();
  for (const chat of chats) {
    const group = noteDateGroup(chat.updated_at, now);
    const key = group === 'upcoming' ? 'today' : group;
    byGroup.set(key, [...(byGroup.get(key) ?? []), chat]);
  }
  return GROUP_ORDER.flatMap((key) => {
    const grouped = byGroup.get(key);
    return grouped ? [{ key, label: NOTE_DATE_GROUP_LABELS[key], chats: grouped }] : [];
  });
}

export interface ChatHistoryPanelProps {
  /** After picking a chat or "Novo chat" (closes the mobile drawer) */
  onNavigate?: () => void;
}

export function ChatHistoryPanel({ onNavigate }: ChatHistoryPanelProps) {
  const navigate = useNavigate();
  const openChatId = useMatch('/chats/:chatId')?.params.chatId ?? null;
  const { data: chats, isLoading, isError } = useChatsList();
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const groups = useMemo(() => groupChats(chats ?? [], new Date()), [chats]);

  const open = (path: string) => {
    navigate(path);
    onNavigate?.();
  };

  const renderList = () => {
    if (isLoading) {
      return (
        <div className={styles.loading} role="status" aria-label="Carregando conversas">
          {[72, 56, 64, 48].map((width) => (
            <Skeleton key={width} width={`${width}%`} />
          ))}
        </div>
      );
    }
    if (isError) {
      return <p className={styles.message}>Não foi possível carregar as conversas.</p>;
    }
    if (groups.length === 0) {
      return <p className={styles.message}>Suas conversas com a Jarvi aparecem aqui.</p>;
    }
    return groups.map((group) => (
      <section key={group.key} className={styles.group} aria-label={group.label}>
        <h3 className={styles.groupLabel}>{group.label}</h3>
        <ul className={styles.rows}>
          {group.chats.map((chat) => {
            const isOpen = chat.id === openChatId;
            return (
              <li key={chat.id} className={`${styles.row} ${isOpen ? styles.rowOpen : ''}`}>
                <ListItem
                  label={chat.title || UNTITLED_CHAT}
                  active={isOpen}
                  className={styles.rowButton}
                  onClick={() => open(`/chats/${chat.id}`)}
                  buttonProps={{
                    title: chat.title || undefined,
                    'aria-current': isOpen ? 'page' : undefined,
                  }}
                />
                <div className={styles.rowActions}>
                  <NoteActionsMenu
                    items={[{ label: 'Excluir conversa', onSelect: () => setDeleteTargetId(chat.id) }]}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    ));
  };

  return (
    <div className={styles.panel}>
      <h2 className={styles.title}>Chats</h2>

      <div className={styles.newChat}>
        <ListItem
          label="Novo chat"
          icon={NotePencil}
          active={openChatId === null}
          onClick={() => open('/chats')}
        />
      </div>

      <div className={styles.list}>{renderList()}</div>

      <DeleteChatDialog chatId={deleteTargetId} onClose={() => setDeleteTargetId(null)} />
    </div>
  );
}
