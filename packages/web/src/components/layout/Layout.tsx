// Layout.tsx
// Route-based page switching using MainLayout internally
import { useLocation } from 'react-router-dom';
import { DialogProvider } from '../../contexts/DialogContext';
import { Tasks } from '../../pages/Tasks';
import { Notes } from '../../pages/Notes';
import { Finances } from '../../pages/Finances';
import { Habits } from '../../pages/Habits';
import { Categories } from '../../pages/Categories';

const LayoutContent = () => {
  const location = useLocation();
  const path = location.pathname;

  switch (path) {
    case '/tasks':
      return <Tasks />;
    case '/notes':
      return <Notes />;
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
