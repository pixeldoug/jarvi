import React, { useState } from 'react';
import { Note } from '../../../contexts/NoteContext';
import { Button } from '../../ui';
import { Plus, TrashSimple, PencilSimple, FunnelSimple } from 'phosphor-react';
import { useCategories } from '../../../hooks/useCategories';

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
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const { categories } = useCategories();

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

  // Filtrar notas por categoria
  const filteredNotes = selectedCategory 
    ? notes.filter(note => note.category === selectedCategory)
    : notes;

  // Obter categorias únicas das notas
  const noteCategories = Array.from(new Set(notes.map(note => note.category).filter(Boolean)));

  const getCategoryColor = (categoryName: string) => {
    const category = categories.find(cat => cat.name === categoryName);
    return category?.color || 'gray';
  };

  const getCategoryStyle = (color: string) => {
    const colorMap: Record<string, string> = {
      red: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      green: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      pink: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
      indigo: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
      gray: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    };
    return colorMap[color] || colorMap.gray;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Notas
          </h2>
          <div className="flex items-center space-x-2">
            {noteCategories.length > 0 && (
              <Button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center space-x-2 px-3 py-2 text-sm"
                variant="secondary"
                size="sm"
              >
                <FunnelSimple className="w-4 h-4" />
                <span>Filtros</span>
              </Button>
            )}
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
        </div>

        {/* Category Filters */}
        {showFilters && noteCategories.length > 0 && (
          <div className="mb-4 space-y-2">
            <div className="flex items-center space-x-2 flex-wrap">
              <span className="text-sm text-gray-600 dark:text-gray-400">Filtrar por categoria:</span>
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-2 py-1 text-xs rounded-full transition-colors ${
                  selectedCategory === null
                    ? 'bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Todas ({notes.length})
              </button>
              {noteCategories.map((category) => {
                const categoryNotes = notes.filter(note => note.category === category);
                return (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category || null)}
                    className={`px-2 py-1 text-xs rounded-full transition-colors ${
                      selectedCategory === category
                        ? getCategoryStyle(getCategoryColor(category))
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {category} ({categoryNotes.length})
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
        {filteredNotes.length === 0 ? (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400">
            <PencilSimple className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">
              {selectedCategory 
                ? `Nenhuma nota na categoria "${selectedCategory}".`
                : 'Nenhuma nota ainda.'
              }
            </p>
            <p className="text-xs">
              {selectedCategory 
                ? 'Tente selecionar outra categoria ou criar uma nova nota.'
                : 'Clique em "Nova" para começar.'
              }
            </p>
          </div>
        ) : (
          <div className="p-2">
            {filteredNotes.map((note) => (
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
                    <div className="flex items-center space-x-2 mb-1">
                      <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {note.title}
                      </h3>
                      {note.category && (
                        <span className={`px-2 py-0.5 text-xs rounded-full ${getCategoryStyle(getCategoryColor(note.category))}`}>
                          {note.category}
                        </span>
                      )}
                      {note.access_level === 'owner' && note.shared_by_name && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                          Compartilhada
                        </span>
                      )}
                      {note.access_level !== 'owner' && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                          {note.shared_by_name ? `Compartilhada por ${note.shared_by_name}` : 'Compartilhada'}
                        </span>
                      )}
                    </div>
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
                    <TrashSimple className="w-4 h-4" />
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
