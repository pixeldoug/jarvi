/**
 * MainLayout Component - Jarvi Web
 * 
 * Main application layout with sidebar slot, main content, and control bar
 * Following JarviDS design system from Figma
 */

import { ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import styles from './MainLayout.module.css';
import { ControlBar, TaskCreationData } from '../../ui/ControlBar';
import { UserMenu } from '../UserMenu';
import { useTheme } from '../../../hooks/useTheme';

// Background images
import bgLight from '../../../assets/login-background.png';
import bgDark from '../../../assets/background-dark.png';

export interface MainLayoutProps {
  /** Content for the sidebar slot - each page provides its own */
  sidebar: ReactNode;
  /** Main content slot */
  children: ReactNode;
  /** Page title */
  title: string;
  /** Current active page for ControlBar */
  activePage?: 'tasks' | 'notes' | 'goals' | 'finances';
  /** Header actions (optional buttons/icons) */
  headerActions?: ReactNode;
  /** Callback when a task is created from ControlBar */
  onCreateTask?: (task: TaskCreationData) => void;
  /** Callback to open task details sidebar */
  onOpenTaskDetails?: (task: any) => void;
  /** Right sidebar slot (e.g., TaskDetailsSidebar) */
  rightSidebar?: ReactNode;
}

export function MainLayout({
  sidebar,
  children,
  title,
  activePage = 'tasks',
  headerActions,
  onCreateTask,
  onOpenTaskDetails,
  rightSidebar,
}: MainLayoutProps) {
  const { isDark } = useTheme();
  const backgroundImage = isDark ? bgDark : bgLight;

  return (
    <div className={styles.layout}>
      {/* Background */}
      <div className={styles.background}>
        <img 
          src={backgroundImage} 
          alt="" 
          className={styles.backgroundImage}
          aria-hidden="true"
        />
      </div>

      {/* Content */}
      <div className={styles.content}>
        {/* Sidebar */}
        <aside className={styles.sidebar}>
          {sidebar}
        </aside>

        {/* Main Content */}
        <main className={styles.main}>
          {/* User Menu */}
          <div className={styles.userMenuArea}>
            <UserMenu />
          </div>

          <header className={styles.mainHeader}>
            <h1 className={styles.mainTitle}>{title}</h1>
            {headerActions && (
              <div>{headerActions}</div>
            )}
          </header>
          
          <div className={styles.mainBody}>
            {children}
          </div>
        </main>

        {/* Right Sidebar */}
        <AnimatePresence>
          {rightSidebar && (
            <motion.aside
              className={styles.rightSidebar}
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 100 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            >
              {rightSidebar}
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Control Bar */}
        <ControlBar activePage={activePage} onCreateTask={onCreateTask} onOpenTaskDetails={onOpenTaskDetails} />
      </div>
    </div>
  );
}

