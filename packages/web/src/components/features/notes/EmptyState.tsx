import React from 'react';
import { Edit3, Plus } from 'phosphor-react';
import { Button } from '../../ui';

interface EmptyStateProps {
  onCreateNote: (noteData: { title: string; content?: string }) => Promise<Note>;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onCreateNote }) => {
  const handleCreateFirstNote = async () => {
    try {
      await onCreateNote({
        title: 'Minha primeira nota',
        content: 'Comece a escrever aqui...',
      });
    } catch (error) {
      console.error('Failed to create note:', error);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <div className="text-center max-w-md">
        <Edit3 className="w-16 h-16 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
        
        <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Bem-vindo às suas notas
        </h3>
        
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Crie sua primeira nota para começar a organizar suas ideias, 
          pensamentos e lembretes importantes.
        </p>
        
        <Button
          onClick={handleCreateFirstNote}
          className="flex items-center space-x-2"
          variant="primary"
        >
          <Plus className="w-5 h-5" />
          <span>Criar primeira nota</span>
        </Button>
      </div>
      
      <div className="mt-8 text-center">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Recursos das notas:
        </h4>
        <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
          <li>• Edição inline em tela cheia</li>
          <li>• Auto-save automático</li>
          <li>• Interface limpa e focada</li>
          <li>• Organização por data</li>
        </ul>
      </div>
    </div>
  );
};
