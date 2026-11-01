/**
 * Chats Page
 *
 * `/chats` starts a conversation with the Jarvi agent; `/chats/:chatId` opens
 * one from the history (the sidebar's Chats section) to read it and keep going.
 * The backend records every turn: a new chat's first message creates the
 * conversation, and the URL moves to its id without remounting the chat.
 * A task card in the chat opens the task's details on the right, like on
 * Tarefas, without leaving the conversation.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';
import { ChatCircle, NotePencil } from '@phosphor-icons/react';
import { MainLayout } from '../../components/layout';
import { Sidebar, type TasksNavigationState } from '../../components/layout/Sidebar';
import { AIChatPanel } from '../../components/features/tasks/AIChatPanel';
import { TaskDetailsSidebar } from '../../components/features/tasks/TaskDetailsSidebar';
import { DeleteChatDialog, UNTITLED_CHAT } from '../../components/features/chats';
import { NoteActionsMenu, NoteEmptyState } from '../../components/features/notes';
import { Button, Loading } from '../../components/ui';
import { toast } from '../../components/ui/Sonner';
import { useTasks } from '../../contexts/TaskContext';
import { isChatNotFoundError, useChat } from '../../hooks/useChats';
import { restoreChatMessages, type ChatConversationRef } from '../../hooks/useChatStream';
import { useChatTaskSync } from '../../hooks/useChatTaskSync';
import styles from './Chats.module.css';

interface ChatSession {
  /** Mounts the chat: a new key is another chat on screen */
  key: string;
  /** The recorded conversation (null until a new chat's first message) */
  conversationId: string | null;
  /** Opened from the history: the stored conversation the chat is built from */
  loadId: string | null;
}

let newChatCount = 0;

const sessionFor = (chatId: string | null): ChatSession =>
  chatId
    ? { key: `chat-${chatId}`, conversationId: chatId, loadId: chatId }
    : { key: `new-${++newChatCount}`, conversationId: null, loadId: null };

export function Chats() {
  const navigate = useNavigate();
  const chatId = useMatch('/chats/:chatId')?.params.chatId ?? null;

  const [session, setSession] = useState<ChatSession>(() => sessionFor(chatId));
  // The conversation on screen, known before the URL catches up with it
  const conversationIdRef = useRef<string | null>(session.conversationId);
  // The chat on screen. A chat left mid-reply keeps streaming (the backend
  // still records its turn), so its late events must not reach this page.
  const sessionKeyRef = useRef(session.key);
  const [liveTitle, setLiveTitle] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Another chat in the URL (sidebar, "Novo chat", back / forward) mounts it.
  useEffect(() => {
    if (chatId !== null && chatId === conversationIdRef.current) return;
    if (chatId === null && session.conversationId === null) return;
    const next = sessionFor(chatId);
    conversationIdRef.current = next.conversationId;
    sessionKeyRef.current = next.key;
    setLiveTitle('');
    setSession(next);
    // Only the URL drives this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  const handleConversation = useCallback((sessionKey: string, conversation: ChatConversationRef) => {
    // e.g. the AI title of the chat that was open before this one
    if (sessionKey !== sessionKeyRef.current) return;
    setLiveTitle(conversation.title);
    if (conversation.id === conversationIdRef.current) return;
    // A new chat was just recorded (or its conversation was deleted meanwhile
    // and the backend started another): same chat on screen, new URL.
    conversationIdRef.current = conversation.id;
    setSession((current) => ({ ...current, conversationId: conversation.id }));
    navigate(`/chats/${conversation.id}`, { replace: true });
  }, [navigate]);

  // Kept when a later refetch fails (e.g. the conversation was deleted elsewhere)
  const chatQuery = useChat(session.loadId);
  const detail = session.loadId ? chatQuery.data : undefined;
  // Built once per chat: the panel only reads it when it mounts
  const seededMessages = useMemo(
    () => (detail ? restoreChatMessages(detail.messages) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session.key, detail !== undefined],
  );

  const { onTaskMutated, onAttachmentsSent } = useChatTaskSync();

  // The task opened from a card, read live from the task list so edits made
  // in the chat show up in the panel (and a deleted task closes it)
  const { tasks, updateTask, toggleTaskCompletion, deleteTask, undoDeleteTask } = useTasks();
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const openTask = openTaskId ? tasks.find((task) => task.id === openTaskId) ?? null : null;

  // Another chat on screen closes the task panel
  useEffect(() => {
    setOpenTaskId(null);
  }, [session.key]);

  const handleTaskCardClick = useCallback((taskId: string) => {
    if (tasks.some((task) => task.id === taskId)) {
      setOpenTaskId(taskId);
      return;
    }
    // Not in the loaded list (e.g. still loading): Tarefas opens it
    navigate('/tasks', { state: { openTaskId: taskId } satisfies TasksNavigationState });
  }, [tasks, navigate]);

  const handleUpdateTask = useCallback(async (taskId: string, taskData: any) => {
    await updateTask(taskId, taskData, false);
  }, [updateTask]);

  const handleToggleCompletion = useCallback(async (taskId: string) => {
    await toggleTaskCompletion(taskId);
  }, [toggleTaskCompletion]);

  const handleDeleteTask = useCallback(async (taskId: string) => {
    try {
      const deletedTask = await deleteTask(taskId, false);
      if (!deletedTask) return;
      setOpenTaskId(null);
      toast.success('Tarefa excluída com sucesso', {
        hasButton: true,
        action: {
          label: 'Desfazer',
          onClick: async () => {
            try {
              if (await undoDeleteTask(deletedTask.id)) {
                toast.success('Tarefa restaurada', {
                  hasButton: true,
                  action: { label: 'Visualizar', onClick: () => setOpenTaskId(deletedTask.id) },
                });
              }
            } catch (error) {
              console.error('Failed to restore task:', error);
            }
          },
        },
      });
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  }, [deleteTask, undoDeleteTask]);

  const handleCategoryCardClick = useCallback((categoryName: string) => {
    navigate('/tasks', { state: { tasksCategory: categoryName } satisfies TasksNavigationState });
  }, [navigate]);

  const renderChat = () => {
    if (session.loadId && !detail) {
      if (chatQuery.isError && isChatNotFoundError(chatQuery.error)) {
        return (
          <NoteEmptyState
            icon={ChatCircle}
            title="Conversa não encontrada"
            description="Ela pode ter sido excluída."
            action={
              <Button variant="secondary" onClick={() => navigate('/chats')}>
                Novo chat
              </Button>
            }
          />
        );
      }
      if (chatQuery.isError) {
        return (
          <div className={styles.errorState}>
            <p className={styles.errorText}>Não foi possível carregar a conversa.</p>
            <Button
              variant="secondary"
              loading={chatQuery.isFetching}
              onClick={() => void chatQuery.refetch()}
            >
              Tentar novamente
            </Button>
          </div>
        );
      }
      return <Loading centered size="lg" />;
    }

    return (
      <AIChatPanel
        key={session.key}
        variant="page"
        mode={detail?.mode ?? 'general'}
        taskId={detail?.task_id ?? undefined}
        noteId={detail?.note_id ?? undefined}
        conversationId={session.loadId ?? undefined}
        seededMessages={seededMessages}
        onConversation={(conversation) => handleConversation(session.key, conversation)}
        onTaskMutated={onTaskMutated}
        onAttachmentsSent={onAttachmentsSent}
        onTaskCardClick={handleTaskCardClick}
        onCategoryCardClick={handleCategoryCardClick}
      />
    );
  };

  const conversationId = session.conversationId;
  const title = liveTitle || detail?.title || UNTITLED_CHAT;

  return (
    <>
      <MainLayout
        sidebar={<Sidebar selectedList={null} />}
        title={title}
        titleVariant="heading"
        hideHeader={!conversationId}
        headerActions={
          conversationId ? (
            <>
              <Button
                variant="secondary"
                size="medium"
                icon={NotePencil}
                iconPosition="left"
                onClick={() => navigate('/chats')}
              >
                Novo chat
              </Button>
              <NoteActionsMenu
                items={[{ label: 'Excluir conversa', onSelect: () => setDeleteTargetId(conversationId) }]}
                triggerVariant="secondary"
                triggerSize="medium"
              />
            </>
          ) : undefined
        }
        // The chat scrolls its own messages, with the input pinned below them
        scrollableBody={false}
        hideControlBar
        rightSidebar={
          openTask ? (
            <TaskDetailsSidebar
              isOpen
              task={openTask}
              onClose={() => setOpenTaskId(null)}
              onUpdateTask={handleUpdateTask}
              onToggleCompletion={handleToggleCompletion}
              onDelete={handleDeleteTask}
            />
          ) : undefined
        }
        rightSidebarAsSheet={!!openTask}
        onRightSidebarClose={() => setOpenTaskId(null)}
      >
        <div className={styles.chat}>{renderChat()}</div>
      </MainLayout>

      <DeleteChatDialog chatId={deleteTargetId} onClose={() => setDeleteTargetId(null)} />
    </>
  );
}
