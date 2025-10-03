import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';

export interface Note {
  id: string;
  user_id: string;
  title: string;
  content: string;
  category?: string;
  created_at: string;
  updated_at: string;
  access_level?: 'owner' | 'read' | 'write';
  shared_by_name?: string;
}

export interface CreateNoteData {
  title: string;
  content?: string;
  category?: string;
}

export interface UpdateNoteData {
  title?: string;
  content?: string;
  category?: string;
}

interface NoteContextType {
  notes: Note[];
  currentNote: Note | null;
  isLoading: boolean;
  error: string | null;
  fetchNotes: () => Promise<void>;
  createNote: (noteData: CreateNoteData, showLoading?: boolean) => Promise<Note>;
  updateNote: (noteId: string, noteData: UpdateNoteData, showLoading?: boolean) => Promise<void>;
  deleteNote: (noteId: string, showLoading?: boolean) => Promise<Note | null>;
  setCurrentNote: (note: Note | null) => void;
  shareNote: (noteId: string, userId: string, permission: 'read' | 'write') => Promise<void>;
  getNoteShares: (noteId: string) => Promise<any[]>;
  updateSharePermission: (noteId: string, shareId: string, permission: 'read' | 'write') => Promise<void>;
  unshareNote: (noteId: string, shareId: string) => Promise<void>;
  searchUsers: (query: string) => Promise<any[]>;
}

const NoteContext = createContext<NoteContextType | undefined>(undefined);

interface NoteProviderProps {
  children: ReactNode;
}

export const NoteProvider: React.FC<NoteProviderProps> = ({ children }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [currentNote, setCurrentNote] = useState<Note | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, token } = useAuth();

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  const fetchNotes = async (): Promise<void> => {
    if (!user || !token) {
      console.log('No user or token available for fetching notes');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/notes`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setNotes(data);
      console.log('Notes fetched successfully:', data.length);
    } catch (error) {
      console.error('Error fetching notes:', error);
      setError('Failed to fetch notes');
    } finally {
      setIsLoading(false);
    }
  };

  const createNote = async (noteData: CreateNoteData, showLoading = true): Promise<Note> => {
    if (!user || !token) {
      throw new Error('User not authenticated');
    }

    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/notes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(noteData),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const newNote = await response.json();
      setNotes(prevNotes => [newNote, ...prevNotes]);
      setCurrentNote(newNote);
      console.log('Note created successfully:', newNote);
      return newNote;
    } catch (error) {
      console.error('Error creating note:', error);
      setError('Failed to create note');
      throw error;
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  };

  const updateNote = async (noteId: string, noteData: UpdateNoteData, showLoading = true): Promise<void> => {
    if (!user || !token) {
      throw new Error('User not authenticated');
    }

    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/notes/${noteId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(noteData),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const updatedNote = await response.json();
      setNotes(prevNotes => 
        prevNotes.map(note => note.id === noteId ? updatedNote : note)
      );
      
      if (currentNote && currentNote.id === noteId) {
        setCurrentNote(updatedNote);
      }
      
      console.log('Note updated successfully:', updatedNote);
    } catch (error) {
      console.error('Error updating note:', error);
      setError('Failed to update note');
      throw error;
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  };

  const deleteNote = async (noteId: string, showLoading = true): Promise<Note | null> => {
    if (!user || !token) {
      throw new Error('User not authenticated');
    }

    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/notes/${noteId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const deletedNote = await response.json();
      setNotes(prevNotes => prevNotes.filter(note => note.id !== noteId));
      
      if (currentNote && currentNote.id === noteId) {
        setCurrentNote(null);
      }
      
      console.log('Note deleted successfully:', deletedNote);
      return deletedNote;
    } catch (error) {
      console.error('Error deleting note:', error);
      setError('Failed to delete note');
      throw error;
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  };

  const shareNote = async (noteId: string, userId: string, permission: 'read' | 'write'): Promise<void> => {
    if (!user) throw new Error('User not authenticated');

    try {
      const response = await fetch(`${API_BASE_URL}/api/notes/${noteId}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sharedWithUserId: userId, permission }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Recarregar notas para atualizar a lista
      await fetchNotes();
    } catch (err: any) {
      setError(err.message || 'Failed to share note');
      throw err;
    }
  };

  const getNoteShares = async (noteId: string): Promise<any[]> => {
    if (!user) throw new Error('User not authenticated');

    try {
      const response = await fetch(`${API_BASE_URL}/api/notes/${noteId}/shares`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (err: any) {
      setError(err.message || 'Failed to fetch note shares');
      throw err;
    }
  };

  const updateSharePermission = async (noteId: string, shareId: string, permission: 'read' | 'write'): Promise<void> => {
    if (!user) throw new Error('User not authenticated');

    try {
      const response = await fetch(`${API_BASE_URL}/api/notes/${noteId}/shares/${shareId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ permission }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Recarregar notas para atualizar a lista
      await fetchNotes();
    } catch (err: any) {
      setError(err.message || 'Failed to update share permission');
      throw err;
    }
  };

  const unshareNote = async (noteId: string, shareId: string): Promise<void> => {
    if (!user) throw new Error('User not authenticated');

    try {
      const response = await fetch(`${API_BASE_URL}/api/notes/${noteId}/shares/${shareId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Recarregar notas para atualizar a lista
      await fetchNotes();
    } catch (err: any) {
      setError(err.message || 'Failed to unshare note');
      throw err;
    }
  };

  const searchUsers = async (query: string): Promise<any[]> => {
    if (!user) throw new Error('User not authenticated');

    try {
      const response = await fetch(`${API_BASE_URL}/api/users/search?q=${encodeURIComponent(query)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (err: any) {
      setError(err.message || 'Failed to search users');
      throw err;
    }
  };

  // Fetch notes when user changes
  useEffect(() => {
    if (user && token) {
      fetchNotes();
    } else {
      setNotes([]);
      setCurrentNote(null);
    }
  }, [user, token]);

  const value: NoteContextType = {
    notes,
    currentNote,
    isLoading,
    error,
    fetchNotes,
    createNote,
    updateNote,
    deleteNote,
    setCurrentNote,
    shareNote,
    getNoteShares,
    updateSharePermission,
    unshareNote,
    searchUsers,
  };

  return (
    <NoteContext.Provider value={value}>
      {children}
    </NoteContext.Provider>
  );
};

export const useNotes = (): NoteContextType => {
  const context = useContext(NoteContext);
  if (context === undefined) {
    throw new Error('useNotes must be used within a NoteProvider');
  }
  return context;
};
