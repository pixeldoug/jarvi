/**
 * ChatHistoryPanel — the sidebar's "Chats" group, below Categorias and built
 * the same way (SidebarGroupHeader + rows):
 *  - closed: the header only
 *  - open: the latest conversations under it
 *  - expanded: the whole history in place of the menu and Categorias
 * The header's actions (Novo chat, Buscar, expand / shrink) show on hover,
 * always while expanded. A row's hover shows when it was last used and its
 * "…" menu (deletes the conversation after a confirm). The mode is kept per
 * browser.
 */

import { useCallback, useState } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';
import {
  ArrowsInSimple,
  ArrowsOutSimple,
  ChatCircle,
  MagnifyingGlass,
  NotePencil,
} from '@phosphor-icons/react';
import { ListItem, Skeleton } from '../../ui';
import { SidebarGroupHeader } from '../../layout/Sidebar/SidebarGroupHeader';
import { useChatsList } from '../../../hooks/useChats';
import { NoteActionsMenu } from '../notes/NoteActionsMenu';
import { formatDateChip } from '../notes/noteText';
import { DeleteChatDialog } from './DeleteChatDialog';
import styles from './ChatHistoryPanel.module.css';

/** Shown for a conversation whose first message had no text */
export const UNTITLED_CHAT = 'Nova conversa';

/** Conversations listed while the section is open (all of them when expanded) */
const OPEN_LIMIT = 6;

export type ChatsSectionMode = 'closed' | 'open' | 'expanded';

const MODE_STORAGE_KEY = 'jarvi_sidebar_chats';

const isChatsSectionMode = (value: unknown): value is ChatsSectionMode =>
  value === 'closed' || value === 'open' || value === 'expanded';

// Module-level so it survives the Sidebar remount when switching pages
let cachedMode: ChatsSectionMode | null = null;

function readMode(): ChatsSectionMode {
  if (cachedMode) return cachedMode;
  try {
    const stored = localStorage.getItem(MODE_STORAGE_KEY);
    if (isChatsSectionMode(stored)) cachedMode = stored;
  } catch {
    // Storage blocked (private window): the default
  }
  return cachedMode ?? 'open';
}

/** The section's mode, for the Sidebar (expanded hides its menu) */
export function useChatsSectionMode() {
  const [mode, setModeState] = useState(readMode);
  const setMode = useCallback((next: ChatsSectionMode) => {
    cachedMode = next;
    try {
      localStorage.setItem(MODE_STORAGE_KEY, next);
    } catch {
      // Kept for this page load only
    }
    setModeState(next);
  }, []);
  return [mode, setMode] as const;
}

/** "agora", "há 5 min", "há 3 h", "Ontem", "4 dias", then the day */
function formatLastUsed(iso: string, now = Date.now()): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const minutes = Math.floor((now - time) / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.max(1, Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(time).setHours(0, 0, 0, 0)) / 86_400_000));
  if (days === 1) return 'Ontem';
  return days < 365 ? `${days} dias` : formatDateChip(iso);
}

export interface ChatHistoryPanelProps {
  mode: ChatsSectionMode;
  onModeChange: (mode: ChatsSectionMode) => void;
  /** Opens the search palette */
  onSearch: () => void;
  /** After picking a chat or "Novo chat" (closes the mobile drawer) */
  onNavigate?: () => void;
}

export function ChatHistoryPanel({ mode, onModeChange, onSearch, onNavigate }: ChatHistoryPanelProps) {
  const navigate = useNavigate();
  const openChatId = useMatch('/chats/:chatId')?.params.chatId ?? null;
  const { data: chats, isLoading, isError } = useChatsList();
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const isExpanded = mode === 'expanded';
  const shown = isExpanded ? chats ?? [] : (chats ?? []).slice(0, OPEN_LIMIT);

  const open = (path: string) => {
    navigate(path);
    onNavigate?.();
  };

  const renderList = () => {
    if (isLoading) {
      return (
        <div className={styles.loading} role="status" aria-label="Carregando conversas">
          {[72, 56, 64].map((width) => (
            <Skeleton key={width} width={`${width}%`} />
          ))}
        </div>
      );
    }
    if (isError) {
      return <p className={styles.message}>Não foi possível carregar as conversas.</p>;
    }
    if (shown.length === 0) {
      return <p className={styles.message}>Suas conversas com a Jarvi aparecem aqui.</p>;
    }
    const now = Date.now();
    return (
      <ul className={styles.rows}>
        {shown.map((chat) => {
          const isOpen = chat.id === openChatId;
          return (
            <li key={chat.id} className={styles.row}>
              <ListItem
                label={chat.title || UNTITLED_CHAT}
                icon={ChatCircle}
                active={isOpen}
                className={styles.rowButton}
                onClick={() => open(`/chats/${chat.id}`)}
                buttonProps={{
                  title: chat.title || undefined,
                  'aria-current': isOpen ? 'page' : undefined,
                }}
              />
              {/* Revealed on row hover / keyboard focus */}
              <div className={styles.rowMeta}>
                <span className={styles.lastUsed}>{formatLastUsed(chat.updated_at, now)}</span>
                <NoteActionsMenu
                  items={[{ label: 'Excluir conversa', onSelect: () => setDeleteTargetId(chat.id) }]}
                />
              </div>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className={`${styles.group} ${isExpanded ? styles.groupExpanded : ''}`}>
      <div className={styles.headerWrapper}>
        <SidebarGroupHeader
          label="Chats"
          isExpanded={mode !== 'closed'}
          onToggle={() => onModeChange(mode === 'closed' ? 'open' : 'closed')}
          actionsVisible={isExpanded}
          actions={[
            { icon: NotePencil, label: 'Novo chat', onClick: () => open('/chats') },
            { icon: MagnifyingGlass, label: 'Buscar', onClick: onSearch },
            isExpanded
              ? { icon: ArrowsInSimple, label: 'Mostrar o menu', onClick: () => onModeChange('open') }
              : { icon: ArrowsOutSimple, label: 'Expandir chats', onClick: () => onModeChange('expanded') },
          ]}
        />
      </div>

      {mode !== 'closed' && (
        <div className={`${styles.list} ${isExpanded ? styles.listExpanded : ''}`}>{renderList()}</div>
      )}

      <DeleteChatDialog chatId={deleteTargetId} onClose={() => setDeleteTargetId(null)} />
    </div>
  );
}
