import React, { useState, useEffect, useRef } from 'react';
import { Note } from '../../../contexts/NoteContext';
import { Button } from '../../ui';
import { TrashSimple, Check, Question, ArrowsOut, ArrowsIn, Share } from '@phosphor-icons/react';
import { useKeyboardShortcuts, KeyboardShortcutsHelp } from './KeyboardShortcuts';
import { CategoryPicker } from './CategoryPicker';
import { ShareModal } from './ShareModal';
import { CollaborationIndicators } from './CollaborationIndicators';
import { useCollaboration } from '../../../hooks/useCollaboration';
import { useAuth } from '../../../contexts/AuthContext';

interface NoteEditorProps {
  note: Note;
  onUpdate: (noteId: string, noteData: { title?: string; content?: string; category?: string }) => Promise<void>;
  onDelete: (noteId: string) => Promise<Note | null>;
  onGoBack?: () => void;
  onNewNote?: () => void;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
  onNoteChange?: (updatedNote: Note) => void;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  note,
  onUpdate,
  onDelete,
  onGoBack,
  onNewNote,
  onToggleFullscreen,
  isFullscreen = false,
  onNoteChange,
}) => {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [category, setCategory] = useState(note.category);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  
  const titleRef = useRef<HTMLInputElement>(null);
  
  // Collaboration hooks
  const { user } = useAuth();
  const { collaborators, isConnected, joinNote, leaveNote, sendNoteChange } = useCollaboration();
  const isReceivingCollaborativeChange = useRef(false);

  // Auto-save timer
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Update local state when note prop changes
  useEffect(() => {
    setTitle(note.title);
    setContent(note.content);
    setCategory(note.category);
    setHasUnsavedChanges(false);
  }, [note.id, note.title, note.content, note.category]);

  // Join note collaboration when note changes
  useEffect(() => {
    if (note.id && isConnected) {
      joinNote(note.id);
    }
    
    return () => {
      if (note.id) {
        leaveNote(note.id);
      }
    };
  }, [note.id, isConnected, joinNote, leaveNote]);

  // Listen for collaborative changes
  useEffect(() => {
    const handleCollaborativeChange = (event: CustomEvent) => {
      const { content: newContent, userId, userName } = event.detail;
      
      // Only apply changes from other users
      if (userId !== user?.id) {
        isReceivingCollaborativeChange.current = true;
        setContent(newContent);
        setHasUnsavedChanges(true);
        
        // Update the current note in the context to reflect the change
        if (onNoteChange) {
          const updatedNote = {
            ...note,
            content: newContent,
            updated_at: new Date().toISOString()
          };
          onNoteChange(updatedNote);
        }
        
        isReceivingCollaborativeChange.current = false;
        console.log(`Content updated by ${userName}`);
      }
    };

    window.addEventListener('collaborative-note-change', handleCollaborativeChange as EventListener);
    
    return () => {
      window.removeEventListener('collaborative-note-change', handleCollaborativeChange as EventListener);
    };
  }, [user?.id, note, onNoteChange]);

  // Auto-save functionality
  useEffect(() => {
    if (hasUnsavedChanges) {
      // Clear existing timeout
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }

      // Set new timeout for auto-save (2 seconds after last change)
      autoSaveTimeoutRef.current = setTimeout(() => {
        handleSave();
      }, 2000);
    }

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [title, content, category, hasUnsavedChanges]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    setHasUnsavedChanges(true);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    setHasUnsavedChanges(true);
    
    // Send collaborative change if not receiving one
    if (!isReceivingCollaborativeChange.current && isConnected) {
      sendNoteChange(note.id, newContent);
    }
  };

  const handleSave = async () => {
    if (!hasUnsavedChanges) return;

    setIsSaving(true);
    try {
      await onUpdate(note.id, { title, content, category });
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Failed to save note:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm('Tem certeza que deseja deletar esta nota? Esta ação não pode ser desfeita.')) {
      try {
        await onDelete(note.id);
      } catch (error) {
        console.error('Failed to delete note:', error);
      }
    }
  };

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onSave: handleSave,
    onDelete: handleDelete,
    onNewNote,
    onGoBack,
    onToggleFocus: () => setShowShortcuts(true),
    onToggleFullscreen,
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };


  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1">
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={handleTitleChange}
              placeholder="Título da nota..."
              className="w-full text-2xl font-bold bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>
          <div className="ml-4">
            <CategoryPicker
              selectedCategory={category}
              onCategoryChange={(newCategory) => {
                setCategory(newCategory);
                setHasUnsavedChanges(true);
              }}
            />
          </div>
          <div className="flex items-center space-x-2">
            {/* Collaboration indicators */}
            <CollaborationIndicators 
              collaborators={collaborators}
              currentUserId={user?.id}
            />
            {hasUnsavedChanges && (
              <span className="text-xs text-orange-500 dark:text-orange-400">
                Não salvo
              </span>
            )}
            {isSaving && (
              <span className="text-xs text-blue-500 dark:text-blue-400">
                Salvando...
              </span>
            )}
            <Button
              onClick={handleSave}
              disabled={!hasUnsavedChanges || isSaving}
              className="flex items-center space-x-1"
              variant="secondary"
              size="small"
            >
              <Check className="w-4 h-4" />
              <span>Salvar</span>
            </Button>
            {note.access_level === 'owner' && (
              <button
                onClick={() => setShowShareModal(true)}
                className="flex items-center space-x-1 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title="Compartilhar nota"
              >
                <Share className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onToggleFullscreen}
              className="flex items-center space-x-1 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title={isFullscreen ? "Sair do modo fullscreen" : "Modo fullscreen"}
            >
              {isFullscreen ? <ArrowsIn className="w-4 h-4" /> : <ArrowsOut className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setShowShortcuts(true)}
              className="flex items-center space-x-1 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Atalhos de teclado (Ctrl+/)"
            >
              <Question className="w-4 h-4" />
            </button>
            {note.access_level === 'owner' && (
              <Button
                onClick={handleDelete}
                className="flex items-center space-x-1 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                variant="ghost"
                size="small"
              >
                <TrashSimple className="w-4 h-4" />
                <span>Deletar</span>
              </Button>
            )}
          </div>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Criado em {formatDate(note.created_at)} • 
          Última atualização {formatDate(note.updated_at)}
        </div>
      </div>

      {/* Content Editor */}
      <div className="flex-1 p-4">
        <textarea
          value={content}
          onChange={handleContentChange}
          placeholder="Comece a escrever sua nota...

Você pode usar formatação Markdown:
**negrito** *itálico* `código`

# Título
## Subtítulo

- Lista item 1
- Lista item 2

[Link](https://example.com)"
          className="w-full h-full resize-none bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 leading-relaxed"
          style={{ minHeight: 'calc(100vh - 200px)' }}
        />
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Dica: Use Ctrl+S para salvar • Ctrl+N para nova nota • Esc para voltar • F11 para fullscreen • Markdown suportado
        </div>
      </div>

              {/* Keyboard Shortcuts Help */}
              <KeyboardShortcutsHelp
                isVisible={showShortcuts}
                onClose={() => setShowShortcuts(false)}
              />

              {/* Share Modal */}
              <ShareModal
                isOpen={showShareModal}
                onClose={() => setShowShareModal(false)}
                noteId={note.id}
                noteTitle={note.title}
              />
            </div>
          );
        };
