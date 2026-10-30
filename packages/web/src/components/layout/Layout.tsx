// Layout.tsx
// Route-based page switching using MainLayout internally
import { useLocation } from 'react-router-dom';
import { DialogProvider } from '../../contexts/DialogContext';
import { Tasks } from '../../pages/Tasks';
import { Notes } from '../../pages/Notes';
import { Apps } from '../../pages/Apps';
import { Chats } from '../../pages/Chats';
import { Finances } from '../../pages/Finances';
import { Habits } from '../../pages/Habits';
import { Categories } from '../../pages/Categories';

const LayoutContent = () => {
  const location = useLocation();
  const path = location.pathname;

  // Notes owns every sub-path (/notes/:noteId).
  if (path === '/notes' || path.startsWith('/notes/')) {
    return <Notes />;
  }

  // Chats owns every sub-path (/chats/:chatId).
  if (path === '/chats' || path.startsWith('/chats/')) {
    return <Chats />;
  }

  switch (path) {
    case '/tasks':
      return <Tasks />;
    case '/apps':
      return <Apps />;
    case '/finances':
      return <Finances />;
    case '/habits':
    case '/goals':
      return <Habits />;
    case '/categories':
      return <Categories />;
    default:
      return <Tasks />;
  }
};

export const Layout = () => {
  return (
    <DialogProvider>
      <LayoutContent />
    </DialogProvider>
  );
};
