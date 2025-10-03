import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { getDatabase, getPool, isPostgreSQL } from '../database';

interface AuthenticatedSocket {
  userId: string;
  userName: string;
  userEmail: string;
}

interface NoteCollaboration {
  noteId: string;
  users: Map<string, AuthenticatedSocket>;
  lastContent?: string;
  lastUpdated?: Date;
}

export class CollaborationService {
  private io: SocketIOServer;
  private noteCollaborations: Map<string, NoteCollaboration> = new Map();
  private userSockets: Map<string, string[]> = new Map(); // userId -> socketIds[]

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
      }
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication error: No token provided'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;
        
        // Buscar dados do usuário no banco
        let user;
        if (isPostgreSQL()) {
          const pool = getPool();
          const client = await pool.connect();
          try {
            const result = await client.query(
              'SELECT id, name, email FROM users WHERE id = $1',
              [decoded.userId]
            );
            user = result.rows[0];
          } finally {
            client.release();
          }
        } else {
          const db = getDatabase();
          user = await db.get(
            'SELECT id, name, email FROM users WHERE id = ?',
            [decoded.userId]
          );
        }

        if (!user) {
          return next(new Error('Authentication error: User not found'));
        }

        (socket as any).user = {
          userId: user.id,
          userName: user.name,
          userEmail: user.email
        };

        next();
      } catch (err) {
        next(new Error('Authentication error: Invalid token'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      const user = (socket as any).user as AuthenticatedSocket;
      console.log(`User ${user.userName} connected with socket ${socket.id}`);

      // Adicionar socket à lista de sockets do usuário
      if (!this.userSockets.has(user.userId)) {
        this.userSockets.set(user.userId, []);
      }
      this.userSockets.get(user.userId)!.push(socket.id);

      // Evento para entrar em uma nota
      socket.on('join-note', async (noteId: string) => {
        try {
          // Verificar se o usuário tem acesso à nota
          const hasAccess = await this.verifyNoteAccess(user.userId, noteId);
          if (!hasAccess) {
            socket.emit('error', { message: 'Access denied to note' });
            return;
          }

          socket.join(noteId);
          
          // Adicionar usuário à colaboração da nota
          if (!this.noteCollaborations.has(noteId)) {
            this.noteCollaborations.set(noteId, {
              noteId,
              users: new Map()
            });
          }

          const collaboration = this.noteCollaborations.get(noteId)!;
          collaboration.users.set(user.userId, user);

          // Notificar outros usuários sobre o novo colaborador
          socket.to(noteId).emit('user-joined', {
            userId: user.userId,
            userName: user.userName,
            userEmail: user.userEmail
          });

          // Enviar lista de usuários ativos para o novo usuário
          const activeUsers = Array.from(collaboration.users.values());
          socket.emit('active-users', activeUsers);

          console.log(`User ${user.userName} joined note ${noteId}`);
        } catch (error) {
          console.error('Error joining note:', error);
          socket.emit('error', { message: 'Failed to join note' });
        }
      });

      // Evento para sair de uma nota
      socket.on('leave-note', (noteId: string) => {
        socket.leave(noteId);
        
        const collaboration = this.noteCollaborations.get(noteId);
        if (collaboration) {
          collaboration.users.delete(user.userId);
          
          // Notificar outros usuários sobre a saída
          socket.to(noteId).emit('user-left', {
            userId: user.userId,
            userName: user.userName
          });

          // Se não há mais usuários, limpar a colaboração
          if (collaboration.users.size === 0) {
            this.noteCollaborations.delete(noteId);
          }
        }

        console.log(`User ${user.userName} left note ${noteId}`);
      });

      // Evento para mudanças de conteúdo
      socket.on('note-change', async (data: { noteId: string; content: string; timestamp: number }) => {
        try {
          const { noteId, content, timestamp } = data;
          
          // Verificar se o usuário tem acesso à nota
          const hasAccess = await this.verifyNoteAccess(user.userId, noteId);
          if (!hasAccess) {
            socket.emit('error', { message: 'Access denied to note' });
            return;
          }

          // Verificar se o usuário tem permissão de escrita
          const hasWriteAccess = await this.verifyWriteAccess(user.userId, noteId);
          if (!hasWriteAccess) {
            socket.emit('error', { message: 'Write access denied' });
            return;
          }

          // Atualizar conteúdo na colaboração
          const collaboration = this.noteCollaborations.get(noteId);
          if (collaboration) {
            collaboration.lastContent = content;
            collaboration.lastUpdated = new Date();
          }

          // Broadcast da mudança para outros usuários na mesma nota
          socket.to(noteId).emit('note-change', {
            content,
            userId: user.userId,
            userName: user.userName,
            timestamp
          });

          console.log(`Note ${noteId} updated by ${user.userName}`);
        } catch (error) {
          console.error('Error handling note change:', error);
          socket.emit('error', { message: 'Failed to update note' });
        }
      });

      // Evento para cursor/posição de edição
      socket.on('cursor-position', (data: { noteId: string; position: number }) => {
        const { noteId, position } = data;
        socket.to(noteId).emit('cursor-position', {
          userId: user.userId,
          userName: user.userName,
          position
        });
      });

      // Evento de desconexão
      socket.on('disconnect', () => {
        console.log(`User ${user.userName} disconnected`);
        
        // Remover socket da lista de sockets do usuário
        const userSockets = this.userSockets.get(user.userId);
        if (userSockets) {
          const index = userSockets.indexOf(socket.id);
          if (index > -1) {
            userSockets.splice(index, 1);
          }
          
          // Se não há mais sockets para este usuário, remover de todas as colaborações
          if (userSockets.length === 0) {
            this.userSockets.delete(user.userId);
            
            // Remover usuário de todas as colaborações ativas
            for (const [noteId, collaboration] of this.noteCollaborations) {
              if (collaboration.users.has(user.userId)) {
                collaboration.users.delete(user.userId);
                
                // Notificar outros usuários sobre a saída
                socket.to(noteId).emit('user-left', {
                  userId: user.userId,
                  userName: user.userName
                });

                // Se não há mais usuários, limpar a colaboração
                if (collaboration.users.size === 0) {
                  this.noteCollaborations.delete(noteId);
                }
              }
            }
          }
        }
      });
    });
  }

  private async verifyNoteAccess(userId: string, noteId: string): Promise<boolean> {
    try {
      if (isPostgreSQL()) {
        const pool = getPool();
        const client = await pool.connect();
        try {
          const result = await client.query(
            `SELECT 1 FROM notes n 
             LEFT JOIN note_shares ns ON n.id = ns.note_id 
             WHERE n.id = $1 AND (n.user_id = $2 OR ns.shared_with_user_id = $2)`,
            [noteId, userId]
          );
          return result.rows.length > 0;
        } finally {
          client.release();
        }
      } else {
        const db = getDatabase();
        const result = await db.get(
          `SELECT 1 FROM notes n 
           LEFT JOIN note_shares ns ON n.id = ns.note_id 
           WHERE n.id = ? AND (n.user_id = ? OR ns.shared_with_user_id = ?)`,
          [noteId, userId]
        );
        return !!result;
      }
    } catch (error) {
      console.error('Error verifying note access:', error);
      return false;
    }
  }

  private async verifyWriteAccess(userId: string, noteId: string): Promise<boolean> {
    try {
      if (isPostgreSQL()) {
        const pool = getPool();
        const client = await pool.connect();
        try {
          const result = await client.query(
            `SELECT 1 FROM notes n 
             LEFT JOIN note_shares ns ON n.id = ns.note_id 
             WHERE n.id = $1 AND (
               n.user_id = $2 OR 
               (ns.shared_with_user_id = $2 AND ns.permission = 'write')
             )`,
            [noteId, userId]
          );
          return result.rows.length > 0;
        } finally {
          client.release();
        }
      } else {
        const db = getDatabase();
        const result = await db.get(
          `SELECT 1 FROM notes n 
           LEFT JOIN note_shares ns ON n.id = ns.note_id 
           WHERE n.id = ? AND (
             n.user_id = ? OR 
             (ns.shared_with_user_id = ? AND ns.permission = 'write')
           )`,
          [noteId, userId]
        );
        return !!result;
      }
    } catch (error) {
      console.error('Error verifying write access:', error);
      return false;
    }
  }

  public getActiveUsers(noteId: string): AuthenticatedSocket[] {
    const collaboration = this.noteCollaborations.get(noteId);
    return collaboration ? Array.from(collaboration.users.values()) : [];
  }

  public getCollaborationStats() {
    return {
      activeCollaborations: this.noteCollaborations.size,
      totalActiveUsers: Array.from(this.userSockets.keys()).length
    };
  }
}
