import { Server as SocketIOServer } from 'socket.io';

let ioInstance: SocketIOServer | null = null;

export const setIO = (io: SocketIOServer): void => {
  ioInstance = io;
};

export const getIO = (): SocketIOServer => {
  if (!ioInstance) {
    throw new Error('Socket.io instance is not initialized');
  }

  return ioInstance;
};

export const hasIO = (): boolean => ioInstance !== null;
