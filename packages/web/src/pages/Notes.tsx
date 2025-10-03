import { useState } from 'react';
import { useNotes, Note } from '../contexts/NoteContext';
import { NotesList } from '../components/features/notes/NotesList';
import { NoteEditor } from '../components/features/notes/NoteEditor';
import { EmptyState } from '../components/features/notes/EmptyState';

export function Notes() {
  const { 
    notes, 
    currentNote, 
    isLoading, 
    error, 
    createNote, 
    updateNote, 
    deleteNote, 
    setCurrentNote 
  } = useNotes();

  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleGoBack = () => {
    setCurrentNote(null);
    setIsFullscreen(false);
  };

  const handleNewNote = async () => {
    try {
      await createNote({
        title: 'Nova nota',
        content: '',
      });
    } catch (error) {
      console.error('Failed to create note:', error);
    }
  };

  const handleNoteSelect = (note: Note | null) => {
    setCurrentNote(note);
    if (note) {
      setIsFullscreen(true);
    }
  };

  if (isLoading && notes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Carregando notas...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">Erro ao carregar notas</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-white dark:bg-gray-900">
      {/* Sidebar com lista de notas - colapsável */}
      {!isFullscreen && (
        <div className="w-80 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <NotesList
            notes={notes}
            currentNote={currentNote}
            onNoteSelect={handleNoteSelect}
            onCreateNote={createNote}
            onDeleteNote={deleteNote}
          />
        </div>
      )}

      {/* Editor inline - fullscreen quando ativo */}
      <div className="flex-1 bg-white dark:bg-gray-900">
        {currentNote ? (
          <NoteEditor
            note={currentNote}
            onUpdate={updateNote}
            onDelete={deleteNote}
            onGoBack={handleGoBack}
            onNewNote={handleNewNote}
          />
        ) : (
          <EmptyState onCreateNote={createNote} />
        )}
      </div>
    </div>
  );
}