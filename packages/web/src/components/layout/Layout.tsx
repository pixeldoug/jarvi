// Layout.tsx
import { Header } from './Header';
import { Drawer } from '../ui/Drawer';
import { DialogProvider, useDialog } from '../../contexts/DialogContext';
import { Tasks } from '../../pages/Tasks';
import { Notes } from '../../pages/Notes';
import { Finances } from '../../pages/Finances';
import { Habits } from '../../pages/Habits';
import { Categories } from '../../pages/Categories';

const LayoutContent = () => {
  const { isOpen, closeDialog, activeSection } = useDialog();

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'tasks':
      case '':
        return <Tasks />;
      case 'notes':
        return <Notes />;
      case 'finances':
        return <Finances />;
      case 'habits':
        return <Habits />;
      case 'categories':
        return <Categories />;
      default:
        return <Tasks />;
    }
  };

  const getSectionTitle = () => {
    switch (activeSection) {
      case 'tasks':
      case '':
        return 'Tarefas';
      case 'notes':
        return 'Notas';
      case 'finances':
        return 'Finanças';
      case 'habits':
        return 'Hábitos';
      case 'categories':
        return 'Categorias';
      default:
        return 'Tarefas';
    }
  };

  return (
    <div className='min-h-screen bg-blue-500'>
      <Header />
      
      <Drawer
        isOpen={isOpen}
        onClose={closeDialog}
        title={getSectionTitle()}
      >
        {renderSectionContent()}
      </Drawer>
    </div>
  );
};

export const Layout = () => {
  return (
    <DialogProvider>
      <LayoutContent />
    </DialogProvider>
  );
};