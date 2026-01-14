import React, { useState, useEffect } from 'react';
import { Modal, Button, Input } from '../../ui';
import { useNotes } from '../../../contexts/NoteContext';
import { Share, User, TrashSimple, MagnifyingGlass } from '@phosphor-icons/react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  noteId: string;
  noteTitle: string;
}

interface User {
  id: string;
  name: string;
  email: string;
}

interface Share {
  id: string;
  shared_with_user_id: string;
  shared_with_name: string;
  shared_with_email: string;
  permission: 'read' | 'write';
  created_at: string;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  noteId,
  noteTitle,
}) => {
  const { shareNote, getNoteShares, updateSharePermission, unshareNote, searchUsers } = useNotes();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Carregar compartilhamentos existentes
  useEffect(() => {
    if (isOpen && noteId) {
      loadShares();
    }
  }, [isOpen, noteId]);

  const loadShares = async () => {
    try {
      const sharesData = await getNoteShares(noteId);
      setShares(sharesData);
    } catch (error) {
      console.error('Error loading shares:', error);
    }
  };

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const users = await searchUsers(query);
      // Filtrar usuários que já têm acesso
      const existingUserIds = shares.map(share => share.shared_with_user_id);
      const filteredUsers = users.filter(user => !existingUserIds.includes(user.id));
      setSearchResults(filteredUsers);
    } catch (error) {
      console.error('Error searching users:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleShare = async (userId: string, permission: 'read' | 'write') => {
    setIsLoading(true);
    try {
      await shareNote(noteId, userId, permission);
      await loadShares();
      setSearchQuery('');
      setSearchResults([]);
    } catch (error) {
      console.error('Error sharing note:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePermission = async (shareId: string, permission: 'read' | 'write') => {
    setIsLoading(true);
    try {
      await updateSharePermission(noteId, shareId, permission);
      await loadShares();
    } catch (error) {
      console.error('Error updating share permission:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnshare = async (shareId: string) => {
    if (window.confirm('Tem certeza que deseja remover o compartilhamento?')) {
      try {
        await unshareNote(noteId, shareId);
        await loadShares();
      } catch (error) {
        console.error('Error unsharing note:', error);
      }
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Compartilhar: ${noteTitle}`}>
      <div className="space-y-4">
        {/* Buscar usuários */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Buscar usuários
          </label>
          <div className="relative">
            <MagnifyingGlass className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Digite nome ou email..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                handleSearch(e.target.value);
              }}
              className="pl-10"
            />
          </div>

          {/* Resultados da busca */}
          {searchResults.length > 0 && (
            <div className="mt-2 border border-gray-200 dark:border-gray-600 rounded-lg max-h-32 overflow-y-auto">
              {searchResults.map((user) => (
                <div key={user.id} className="p-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <User className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {user.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {user.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex space-x-1">
                      <Button
                        onClick={() => handleShare(user.id, 'read')}
                        size="small"
                        variant="secondary"
                        disabled={isLoading}
                      >
                        Leitura
                      </Button>
                      <Button
                        onClick={() => handleShare(user.id, 'write')}
                        size="small"
                        variant="primary"
                        disabled={isLoading}
                      >
                        Escrita
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {isSearching && (
            <div className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">
              Buscando usuários...
            </div>
          )}
        </div>

        {/* Lista de compartilhamentos */}
        {shares.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Usuários com acesso
            </label>
            <div className="space-y-2">
              {shares.map((share) => (
                <div key={share.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <User className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {share.shared_with_name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {share.shared_with_email} • {formatDate(share.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="flex space-x-1">
                      <button
                        onClick={() => handleUpdatePermission(share.id, 'read')}
                        disabled={isLoading}
                        className={`px-2 py-1 text-xs rounded-full transition-colors ${
                          share.permission === 'read'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-800'
                        }`}
                        title="Alterar para Leitura"
                      >
                        Leitura
                      </button>
                      <button
                        onClick={() => handleUpdatePermission(share.id, 'write')}
                        disabled={isLoading}
                        className={`px-2 py-1 text-xs rounded-full transition-colors ${
                          share.permission === 'write'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-green-50 dark:hover:bg-green-800'
                        }`}
                        title="Alterar para Escrita"
                      >
                        Escrita
                      </button>
                    </div>
                    <button
                      onClick={() => handleUnshare(share.id)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                      title="Remover compartilhamento"
                    >
                      <TrashSimple className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {shares.length === 0 && (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400">
            <Share className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Esta nota ainda não foi compartilhada.</p>
          </div>
        )}
      </div>
    </Modal>
  );
};
