import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';

interface Collaborator {
  userId: string;
  userName: string;
  userEmail: string;
}

interface UseCollaborationReturn {
  socket: Socket | null;
  collaborators: Collaborator[];
  isConnected: boolean;
  joinNote: (noteId: string) => void;
  leaveNote: (noteId: string) => void;
  sendNoteChange: (noteId: string, content: string) => void;
  sendCursorPosition: (noteId: string, position: number) => void;
}

export const useCollaboration = (): UseCollaborationReturn => {
  const { user, token } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const currentNoteId = useRef<string | null>(null);

  // Initialize socket connection
  useEffect(() => {
    if (!user || !token) return;

    const newSocket = io(process.env.REACT_APP_API_URL || 'http://localhost:3001', {
      auth: {
        token: token
      }
    });

    newSocket.on('connect', () => {
      console.log('Connected to collaboration server');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from collaboration server');
      setIsConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setIsConnected(false);
    });

    // Handle collaboration events
    newSocket.on('user-joined', (collaborator: Collaborator) => {
      console.log('User joined:', collaborator.userName);
      setCollaborators(prev => {
        const exists = prev.find(c => c.userId === collaborator.userId);
        if (exists) return prev;
        return [...prev, collaborator];
      });
    });

    newSocket.on('user-left', (collaborator: { userId: string; userName: string }) => {
      console.log('User left:', collaborator.userName);
      setCollaborators(prev => prev.filter(c => c.userId !== collaborator.userId));
    });

    newSocket.on('active-users', (users: Collaborator[]) => {
      console.log('Active users:', users.map(u => u.userName));
      setCollaborators(users);
    });

    newSocket.on('note-change', (data: {
      content: string;
      userId: string;
      userName: string;
      timestamp: number;
    }) => {
      // Only handle changes from other users
      if (data.userId !== user.id) {
        console.log('Note changed by:', data.userName);
        // This will be handled by the component that uses this hook
        // We'll emit a custom event that components can listen to
        window.dispatchEvent(new CustomEvent('collaborative-note-change', {
          detail: data
        }));
      }
    });

    newSocket.on('cursor-position', (data: {
      userId: string;
      userName: string;
      position: number;
    }) => {
      if (data.userId !== user.id) {
        // Emit custom event for cursor position
        window.dispatchEvent(new CustomEvent('collaborative-cursor-position', {
          detail: data
        }));
      }
    });

    newSocket.on('error', (error: { message: string }) => {
      console.error('Collaboration error:', error.message);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [user, token]);

  const joinNote = useCallback((noteId: string) => {
    if (socket && isConnected) {
      // Leave previous note if any
      if (currentNoteId.current) {
        socket.emit('leave-note', currentNoteId.current);
      }
      
      socket.emit('join-note', noteId);
      currentNoteId.current = noteId;
      console.log('Joined note:', noteId);
    }
  }, [socket, isConnected]);

  const leaveNote = useCallback((noteId: string) => {
    if (socket && isConnected) {
      socket.emit('leave-note', noteId);
      if (currentNoteId.current === noteId) {
        currentNoteId.current = null;
      }
      console.log('Left note:', noteId);
    }
  }, [socket, isConnected]);

  const sendNoteChange = useCallback((noteId: string, content: string) => {
    if (socket && isConnected) {
      socket.emit('note-change', {
        noteId,
        content,
        timestamp: Date.now()
      });
    }
  }, [socket, isConnected]);

  const sendCursorPosition = useCallback((noteId: string, position: number) => {
    if (socket && isConnected) {
      socket.emit('cursor-position', {
        noteId,
        position
      });
    }
  }, [socket, isConnected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socket && currentNoteId.current) {
        socket.emit('leave-note', currentNoteId.current);
      }
    };
  }, [socket]);

  return {
    socket,
    collaborators,
    isConnected,
    joinNote,
    leaveNote,
    sendNoteChange,
    sendCursorPosition
  };
};
