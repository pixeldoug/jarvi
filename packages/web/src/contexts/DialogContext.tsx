import React, { createContext, useContext, useState } from 'react';

interface DialogContextType {
  isOpen: boolean;
  activeSection: string | null;
  openDialog: (section: string) => void;
  closeDialog: () => void;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export const useDialog = () => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within DialogProvider');
  }
  return context;
};

export const DialogProvider = ({ children }: { children: React.ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  return (
    <DialogContext.Provider value={{
      isOpen,
      activeSection,
      openDialog: (section: string) => {
        setActiveSection(section);
        setIsOpen(true);
      },
      closeDialog: () => {
        setIsOpen(false);
        setActiveSection(null);
      }
    }}>
      {children}
    </DialogContext.Provider>
  );
};