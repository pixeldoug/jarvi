import React, { useState } from 'react';
import { Note } from '../../../contexts/NoteContext';
import { Button } from '../../ui';
import { Plus, Trash2, PencilSimple } from 'phosphor-react';

interface NotesListProps {
  notes: Note[];
  currentNote: Note | null;
  onNoteSelect: (note: Note | null) => void;
  onCreateNote: (noteData: { title: string; content?: string }) => Promise<Note>;
  onDeleteNote: (noteId: string) => Promise<Note | null>;
}

export const NotesList: React.FC<NotesListProps> = ({
  notes,
  currentNote,
  onNoteSelect,
  onCreateNote,
  onDeleteNote,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');

  const handleCreateNote = async () => {
    if (!newNoteTitle.trim()) return;

    try {
      await onCreateNote({
        title: newNoteTitle.trim(),
        content: '',
      });
      setNewNoteTitle('');
      setIsCreating(false);
    } catch (error) {
      console.error('Failed to create note:', error);
    }
  };

  const handleDeleteNote = async (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (window.confirm('Tem certeza que deseja deletar esta nota?')) {
      try {
        await onDeleteNote(noteId);
      } catch (error) {
        console.error('Failed to delete note:', error);
      }
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString('pt-BR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } else if (diffInHours < 24 * 7) {
      return date.toLocaleDateString('pt-BR', { 
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } else {
      return date.toLocaleDateString('pt-BR', { 
        day: '2-digit',
        month: '2-digit',
        year: '2-digit'
      });
    }
  };

  const getPreviewText = (content: string) => {
    if (!content) return 'Sem conteúdo...';
    
    const plainText = content.replace(/<[^>]*>/g, ''); // Remove HTML tags
    return plainText.length > 100 
      ? `${plainText.substring(0, 100)}...` 
      : plainText;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Notas
          </h2>
          <Button
            onClick={() => setIsCreating(true)}
            className="flex items-center space-x-2 px-3 py-2 text-sm"
            variant="primary"
            size="sm"
          >
            <Plus className="w-4 h-4" />
            <span>Nova</span>
          </Button>
        </div>

        {/* Create Note Form */}
        {isCreating && (
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Título da nota..."
              value={newNoteTitle}
              onChange={(e) => setNewNoteTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateNote();
                } else if (e.key === 'Escape') {
                  setIsCreating(false);
                  setNewNoteTitle('');
                }
              }}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              autoFocus
            />
            <div className="flex space-x-2">
              <Button
                onClick={handleCreateNote}
                className="text-xs"
                variant="primary"
                size="sm"
                disabled={!newNoteTitle.trim()}
              >
                Criar
              </Button>
              <Button
                onClick={() => {
                  setIsCreating(false);
                  setNewNoteTitle('');
                }}
                className="text-xs"
                variant="secondary"
                size="sm"
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto">
        {notes.length === 0 ? (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400">
            <PencilSimple className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhuma nota ainda.</p>
            <p className="text-xs">Clique em "Nova" para começar.</p>
          </div>
        ) : (
          <div className="p-2">
            {notes.map((note) => (
              <div
                key={note.id}
                onClick={() => onNoteSelect(note)}
                className={`
                  p-3 mb-2 rounded-lg cursor-pointer transition-colors
                  ${currentNote?.id === note.id
                    ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700'
                    : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }
                `}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {note.title}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                      {getPreviewText(note.content)}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                      {formatDate(note.updated_at)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleDeleteNote(note.id, e)}
                    className="ml-2 p-1 text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    title="Deletar nota"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
