import React from 'react';
import { Users } from 'phosphor-react';

interface Collaborator {
  userId: string;
  userName: string;
  userEmail: string;
}

interface CollaborationIndicatorsProps {
  collaborators: Collaborator[];
  currentUserId?: string;
}

export const CollaborationIndicators: React.FC<CollaborationIndicatorsProps> = ({
  collaborators,
  currentUserId
}) => {
  // Filter out current user from collaborators list
  const otherCollaborators = collaborators.filter(c => c.userId !== currentUserId);

  if (otherCollaborators.length === 0) {
    return null;
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getCollaboratorColor = (userId: string) => {
    // Generate a consistent color based on userId
    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-purple-500',
      'bg-red-500',
      'bg-yellow-500',
      'bg-pink-500',
      'bg-indigo-500',
      'bg-orange-500'
    ];
    
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="flex items-center space-x-2">
      <Users className="w-4 h-4 text-gray-500 dark:text-gray-400" />
      <span className="text-sm text-gray-600 dark:text-gray-400">
        Editando:
      </span>
      <div className="flex -space-x-2">
        {otherCollaborators.slice(0, 3).map((collaborator) => (
          <div
            key={collaborator.userId}
            className={`relative w-8 h-8 rounded-full ${getCollaboratorColor(collaborator.userId)} flex items-center justify-center text-white text-xs font-medium border-2 border-white dark:border-gray-800 shadow-sm`}
            title={`${collaborator.userName} (${collaborator.userEmail})`}
          >
            {getInitials(collaborator.userName)}
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-400 border-2 border-white dark:border-gray-800 rounded-full"></div>
          </div>
        ))}
        {otherCollaborators.length > 3 && (
          <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 text-xs font-medium border-2 border-white dark:border-gray-800 shadow-sm">
            +{otherCollaborators.length - 3}
          </div>
        )}
      </div>
    </div>
  );
};
