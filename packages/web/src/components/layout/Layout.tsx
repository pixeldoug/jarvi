// Layout.tsx
// Route-based page switching using MainLayout internally
import { useLocation } from 'react-router-dom';
import { DialogProvider } from '../../contexts/DialogContext';
import { TasksV2 } from '../../pages/TasksV2';
import { Notes } from '../../pages/Notes';
import { Finances } from '../../pages/Finances';
import { Habits } from '../../pages/Habits';
import { Categories } from '../../pages/Categories';

const LayoutContent = () => {
  const location = useLocation();
  const path = location.pathname;

  switch (path) {
    case '/tasks':
    case '/':
      return <TasksV2 />;
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
      return <TasksV2 />;
  }
};

export const Layout = () => {
  return (
    <DialogProvider>
      <LayoutContent />
    </DialogProvider>
  );
};
