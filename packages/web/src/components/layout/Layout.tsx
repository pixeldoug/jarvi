// Layout.tsx
// Route-based page switching using MainLayout internally
import { useLocation } from 'react-router-dom';
import { DialogProvider } from '../../contexts/DialogContext';
import { ErrorBoundary } from '../ui';
import { Tasks } from '../../pages/Tasks';
import { Notes } from '../../pages/Notes';
import { Finances } from '../../pages/Finances';
import { Habits } from '../../pages/Habits';
import { Categories } from '../../pages/Categories';

const renderPage = (path: string) => {
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

const LayoutContent = () => {
  const location = useLocation();
  const path = location.pathname;

  // Each page is wrapped in an ErrorBoundary so a render-time crash degrades
  // gracefully instead of taking down the whole app. Keyed by path so the
  // boundary resets when navigating to a different page.
  return (
    <ErrorBoundary resetKey={path} context={{ page: path }}>
      {renderPage(path)}
    </ErrorBoundary>
  );
};

export const Layout = () => {
  return (
    <DialogProvider>
      <LayoutContent />
    </DialogProvider>
  );
};
