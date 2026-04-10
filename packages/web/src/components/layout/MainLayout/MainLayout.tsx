/**
 * MainLayout Component - Jarvi Web
 * 
 * Main application layout with sidebar slot, main content, and control bar
 * Following JarviDS design system from Figma
 */

import { ReactNode, RefObject } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import styles from './MainLayout.module.css';
import { ControlBar, TaskCreationData } from '../../ui/ControlBar';
import { useBackground } from '../../../contexts/BackgroundContext';

export interface MainLayoutProps {
  /** Content for the sidebar slot - each page provides its own */
  sidebar: ReactNode;
  /** Main content slot */
  children: ReactNode;
  /** Page title */
  title: string;
  /** Header actions (optional buttons/icons) */
  headerActions?: ReactNode;
  /** Inline content rendered right after the title, before headerActions */
  titleSuffix?: ReactNode;
  /** Header title visual variant */
  titleVariant?: 'display' | 'heading';
  /** Optional description below the title */
  titleDescription?: string;
  /** Callback when a task is created from ControlBar */
  onCreateTask?: (task: TaskCreationData) => void;
  /** Callback to open task details sidebar */
  onOpenTaskDetails?: (task: any) => void;
  /** Right sidebar slot (e.g., TaskDetailsSidebar) */
  rightSidebar?: ReactNode;
  /** Callback to open AI chat panel */
  onOpenChat?: () => void;
  /** Callback when user submits a prompt from the ControlBar (passes the text) */
  onSubmitPrompt?: (text: string) => void;
  /** When true, hides the ControlBar (e.g. while chat panel is open) */
  hideControlBar?: boolean;
  /** When true, hides the page title/header (e.g. when task details fill the center column) */
  hideHeader?: boolean;
  /** Ref forwarded to the scrollable main body div — used for scroll-spy roots. */
  mainBodyRef?: RefObject<HTMLDivElement>;
}

export function MainLayout({
  sidebar,
  children,
  title,
  headerActions,
  titleSuffix,
  titleVariant = 'display',
  titleDescription,
  onCreateTask,
  onOpenTaskDetails,
  rightSidebar,
  onOpenChat,
  onSubmitPrompt,
  hideControlBar = false,
  hideHeader = false,
  mainBodyRef,
}: MainLayoutProps) {
  const { backgroundSrc } = useBackground();
  const mainTitleClasses = [
    styles.mainTitle,
    titleVariant === 'heading' && styles.mainTitleHeading,
  ].filter(Boolean).join(' ');

  return (
    <div className={styles.layout}>
      {/* Background */}
      <div className={styles.background}>
        {backgroundSrc ? (
          <img
            src={backgroundSrc}
            alt=""
            className={styles.backgroundImage}
            aria-hidden="true"
          />
        ) : (
          <div className={styles.backgroundSolid} aria-hidden="true" />
        )}
      </div>

      {/* Content */}
      <div className={styles.content}>
        {/* Sidebar */}
        <aside className={styles.sidebar}>
          {sidebar}
        </aside>

        {/* Main Content */}
        <main className={styles.main}>
          {!hideHeader && (
            <header className={styles.mainHeader}>
              <div className={styles.mainHeaderContent}>
                <div className={styles.mainTitleRow}>
                  <div className={styles.mainTitleGroup}>
                    <h1 className={mainTitleClasses}>{title}</h1>
                    {titleSuffix && <div className={styles.mainTitleSuffix}>{titleSuffix}</div>}
                  </div>
                  {headerActions && (
                    <div className={styles.mainHeaderActions}>{headerActions}</div>
                  )}
                </div>
                {titleDescription && (
                  <p className={styles.mainDescription}>{titleDescription}</p>
                )}
              </div>
            </header>
          )}
          
          <div className={styles.mainBody} ref={mainBodyRef}>
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

        {/* Control Bar – hidden while chat panel is open */}
        <ControlBar
          onCreateTask={onCreateTask}
          onOpenTaskDetails={onOpenTaskDetails}
          onOpenChat={onOpenChat}
          onSubmitPrompt={onSubmitPrompt}
          hidden={hideControlBar}
        />
      </div>
    </div>
  );
}

