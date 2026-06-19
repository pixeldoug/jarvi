/**
 * MainLayout Component - Jarvi Web
 * 
 * Main application layout with sidebar slot, main content, and control bar
 * Following JarviDS design system from Figma
 */

import { ReactNode, RefObject, TouchEvent as ReactTouchEvent, createContext, useContext, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { SidebarSimple, PencilSimple } from '@phosphor-icons/react';
import styles from './MainLayout.module.css';
import { ControlBar, TaskCreationData } from '../../ui/ControlBar';
import { Button } from '../../ui/Button/Button';
import { BottomSheet } from '../../ui/BottomSheet/BottomSheet';
import { useBackground } from '../../../contexts/BackgroundContext';
import { useMediaQuery } from '../../../hooks/useMediaQuery';

/** Breakpoint used to switch the layout into mobile (overlay sidebar) mode. */
export const MOBILE_BREAKPOINT = '(max-width: 768px)';

interface MobileSidebarContextValue {
  /** True when the layout is rendered in mobile (overlay) mode. */
  isMobile: boolean;
  /** True when the overlay sidebar is currently open. */
  isOpen: boolean;
  /** Closes the overlay sidebar (no-op on desktop). */
  close: () => void;
}

const MobileSidebarContext = createContext<MobileSidebarContextValue>({
  isMobile: false,
  isOpen: false,
  close: () => {},
});

/**
 * Lets sidebar content react to the mobile overlay drawer — e.g. close it when
 * the user picks a navigation item, or render the collapse button as a close
 * button. On desktop `isMobile` is false and everything behaves as before.
 */
export function useMobileSidebar(): MobileSidebarContextValue {
  return useContext(MobileSidebarContext);
}

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
  /**
   * When true, on mobile the `rightSidebar` content is presented as a bottom
   * sheet (matching the account pages overlay pattern) instead of a full-screen
   * side panel. Desktop is unaffected.
   */
  rightSidebarAsSheet?: boolean;
  /** Close handler used by the mobile bottom sheet (backdrop / drag-to-close). */
  onRightSidebarClose?: () => void;
  /** Callback to open AI chat panel */
  onOpenChat?: () => void;
  /** Callback when user submits a prompt from the ControlBar (passes the text) */
  onSubmitPrompt?: (text: string) => void;
  /** When true, hides the ControlBar (e.g. while chat panel is open) */
  hideControlBar?: boolean;
  /** When true, hides the page title/header (e.g. when task details fill the center column) */
  hideHeader?: boolean;
  /** When true, removes scroll and padding from mainBody so child can manage its own scroll */
  fullHeightContent?: boolean;
  /** Ref forwarded to the scrollable main body div — used for scroll-spy roots. */
  mainBodyRef?: RefObject<HTMLDivElement>;
  /** Default category pre-filled in the ControlBar task creation mode */
  defaultTaskCategory?: string;
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
  rightSidebarAsSheet = false,
  onRightSidebarClose,
  onOpenChat,
  onSubmitPrompt,
  hideControlBar = false,
  hideHeader = false,
  fullHeightContent = false,
  mainBodyRef,
  defaultTaskCategory,
}: MainLayoutProps) {
  const { backgroundSrc } = useBackground();
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const isDrawerOpen = isMobile && isSidebarOpen;
  const [isMobileControlBarOpen, setIsMobileControlBarOpen] = useState(false);

  // Reset the overlay state whenever we leave mobile so the desktop layout is
  // never affected by a previously-open drawer.
  useEffect(() => {
    if (!isMobile) setIsSidebarOpen(false);
  }, [isMobile]);

  // Lock body scroll and allow Escape to close while the drawer is open.
  useEffect(() => {
    if (!isDrawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsSidebarOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDrawerOpen]);

  const mainTitleClasses = [
    styles.mainTitle,
    titleVariant === 'heading' && styles.mainTitleHeading,
  ].filter(Boolean).join(' ');

  const closeSidebar = () => setIsSidebarOpen(false);

  // ── Swipe-to-close gesture for the mobile drawer (swipe right → left) ───────
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const [drawerDragX, setDrawerDragX] = useState<number | null>(null);

  const handleDrawerTouchStart = (e: ReactTouchEvent<HTMLElement>) => {
    const touch = e.touches[0];
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleDrawerTouchMove = (e: ReactTouchEvent<HTMLElement>) => {
    if (!swipeStartRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - swipeStartRef.current.x;
    const dy = touch.clientY - swipeStartRef.current.y;
    // Engage only on a clearly horizontal, leftward gesture
    if (drawerDragX === null) {
      if (Math.abs(dx) > Math.abs(dy) && dx < -8) {
        setDrawerDragX(dx);
      }
      return;
    }
    setDrawerDragX(Math.min(0, dx));
  };

  const handleDrawerTouchEnd = () => {
    if (drawerDragX !== null && drawerDragX < -80) {
      closeSidebar();
    }
    setDrawerDragX(null);
    swipeStartRef.current = null;
  };

  return (
    <MobileSidebarContext.Provider value={{ isMobile, isOpen: isDrawerOpen, close: closeSidebar }}>
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
        {/* Mobile overlay backdrop */}
        {isDrawerOpen && (
          <div
            className={styles.backdrop}
            onClick={closeSidebar}
            aria-hidden="true"
          />
        )}

        {/* Sidebar */}
        <aside
          className={styles.sidebar}
          data-open={isDrawerOpen ? '' : undefined}
          onTouchStart={isMobile ? handleDrawerTouchStart : undefined}
          onTouchMove={isMobile ? handleDrawerTouchMove : undefined}
          onTouchEnd={isMobile ? handleDrawerTouchEnd : undefined}
          style={
            drawerDragX !== null
              ? { transform: `translateX(${drawerDragX}px)`, transition: 'none' }
              : undefined
          }
        >
          {sidebar}
        </aside>

        {/* Main Content */}
        <main className={styles.main}>
          {/* Mobile-only top bar with the sidebar toggle (hidden on desktop via CSS) */}
          <div className={styles.mobileTopBar}>
            <Button
              type="button"
              variant="ghost"
              size="medium"
              icon={SidebarSimple}
              iconPosition="icon-only"
              aria-label="Abrir menu"
              aria-expanded={isDrawerOpen}
              onClick={() => setIsSidebarOpen(true)}
            />
          </div>

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
          
          <div
            className={`${styles.mainBody} ${fullHeightContent ? styles.mainBodyNoScroll : ''}`}
            ref={mainBodyRef}
          >
            {children}
          </div>
        </main>

        {/* Right Sidebar — desktop, or mobile when not presented as a bottom sheet */}
        <AnimatePresence>
          {rightSidebar && !(isMobile && rightSidebarAsSheet) && (
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

        {/* Mobile: present the right panel as a bottom sheet (account-pages pattern).
            Kept mounted so the slide-down close animation can play. */}
        {isMobile && (
          <BottomSheet
            isOpen={rightSidebarAsSheet && !!rightSidebar}
            onClose={onRightSidebarClose ?? (() => {})}
            hideHeader
            flush
            fullHeight
          >
            {rightSidebar}
          </BottomSheet>
        )}

        {/* Control Bar – hidden while chat panel is open */}
        {isMobile && !hideControlBar && isMobileControlBarOpen && (
          <div
            className={styles.controlBarBackdrop}
            onClick={() => setIsMobileControlBarOpen(false)}
            aria-hidden="true"
          />
        )}

        <ControlBar
          onCreateTask={onCreateTask}
          onOpenTaskDetails={onOpenTaskDetails}
          onOpenChat={onOpenChat}
          onSubmitPrompt={onSubmitPrompt}
          hidden={hideControlBar || (isMobile && !isMobileControlBarOpen)}
          defaultCategory={defaultTaskCategory}
          onMobileClose={isMobile ? () => setIsMobileControlBarOpen(false) : undefined}
        />

        {/* FAB – mobile only, hidden while chat is open or ControlBar is visible */}
        {isMobile && !hideControlBar && !isMobileControlBarOpen && (
          <button
            type="button"
            className={styles.fab}
            aria-label="Abrir barra de controle"
            onClick={() => setIsMobileControlBarOpen(true)}
          >
            <PencilSimple weight="regular" size={24} />
          </button>
        )}
      </div>
    </div>
    </MobileSidebarContext.Provider>
  );
}

