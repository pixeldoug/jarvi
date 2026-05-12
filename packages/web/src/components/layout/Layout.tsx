// Layout.tsx
// Route-based page switching using MainLayout internally
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { DialogProvider } from '../../contexts/DialogContext';
import { Tasks } from '../../pages/Tasks';
import { Notes } from '../../pages/Notes';
import { Finances } from '../../pages/Finances';
import { Habits } from '../../pages/Habits';
import { Categories } from '../../pages/Categories';
import { WhatsNewDialog } from '../features/account/WhatsNewDialog/WhatsNewDialog';
import { LATEST_CHANGELOG_VERSION } from '../../data/changelog';

const SEEN_VERSION_KEY = 'jarvi_seen_version';

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
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(SEEN_VERSION_KEY);
    if (seen !== LATEST_CHANGELOG_VERSION) {
      setShowWhatsNew(true);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem(SEEN_VERSION_KEY, LATEST_CHANGELOG_VERSION);
    setShowWhatsNew(false);
  };

  return (
    <DialogProvider>
      <LayoutContent />
      <WhatsNewDialog isOpen={showWhatsNew} onClose={handleClose} />
    </DialogProvider>
  );
};
