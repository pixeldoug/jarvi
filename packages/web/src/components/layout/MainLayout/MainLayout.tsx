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
import type { ChatAttachment } from '../../../hooks/useChatStream';
import { Button } from '../../ui/Button/Button';
import { BottomSheet } from '../../ui/BottomSheet/BottomSheet';
import { useBackground } from '../../../contexts/BackgroundContext';
import { useMediaQuery } from '../../../hooks/useMediaQuery';

const RIGHT_SIDEBAR_VARIANTS = {
  hidden: (transition: 'slide' | 'morph') =>
    transition === 'morph' ? { opacity: 0, x: -24 } : { opacity: 0, x: 100 },
  shown: { opacity: 1, x: 0 },
  leaving: (transition: 'slide' | 'morph') =>
    transition === 'morph'
      ? { opacity: 0, transition: { duration: 0 } }
      : { opacity: 0, x: 100 },
};

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
  /**
   * How the desktop right panel comes and goes: `slide` (default) from the
   * right; `morph` when its content moves to / from the main card (a task's
   * details expanding to full screen): it leaves at once, so the main card
   * takes its room right away, and comes back with a short settle.
   */
  rightSidebarTransition?: 'slide' | 'morph';
  /** Close handler used by the mobile bottom sheet (backdrop / drag-to-close). */
  onRightSidebarClose?: () => void;
  /** Callback to open AI chat panel */
  onOpenChat?: () => void;
  /** Callback when user submits a prompt from the ControlBar (text + optional attachments) */
  onSubmitPrompt?: (text: string, attachments?: ChatAttachment[]) => void;
  /** When true, hides the ControlBar (e.g. while chat panel is open) */
  hideControlBar?: boolean;
  /** When true, hides the page title/header (e.g. when task details fill the center column) */
  hideHeader?: boolean;
  /** When true, removes scroll and padding from mainBody so child can manage its own scroll */
  fullHeightContent?: boolean;
  /**
   * When false, mainBody neither scrolls nor clips (and drops the scroll
   * paddings), so the child owns its scroll area and may bleed over the card's
   * padding (`--main-padding-top` / `--main-padding-x`) — like
   * `fullHeightContent`, but keeping the glass background. Default true.
   */
  scrollableBody?: boolean;
  /** Ref forwarded to the scrollable main body div — used for scroll-spy roots. */
  mainBodyRef?: RefObject<HTMLDivElement>;
  /** Default category pre-filled in the ControlBar task creation mode */
  defaultTaskCategory?: string;
  /** ControlBar prompt placeholder (defaults to the ControlBar's own) */
  controlBarPlaceholder?: string;
  /** ControlBar prompt-mode slot rendered before the input (e.g. record control) */
  controlBarLeading?: ReactNode;
  /** ControlBar mode changes (`controlBarLeading` only shows in prompt mode) */
  onControlBarModeChange?: (mode: 'prompt' | 'task') => void;
  /** Centered just above the ControlBar (prompt mode only) */
  controlBarAbove?: ReactNode;
  /**
   * Kept in the panel's top-right corner, outside the header, so it stays one
   * mounted instance while the page swaps views (even with `hideHeader`), e.g.
   * a view switch that must animate between them. The header actions, and any
   * child toolbar via `--main-pinned-action-space`, leave room for it.
   */
  pinnedAction?: ReactNode;
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
  rightSidebarTransition = 'slide',
  onRightSidebarClose,
  onOpenChat,
  onSubmitPrompt,
  hideControlBar = false,
  hideHeader = false,
  fullHeightContent = false,
  scrollableBody = true,
  mainBodyRef,
  defaultTaskCategory,
  controlBarPlaceholder,
  controlBarLeading,
  onControlBarModeChange,
  controlBarAbove,
  pinnedAction,
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

  // Desktop: center the ControlBar on the main canvas, not on the viewport
  // (which includes the sidebar). Written as CSS vars on the layout root so
  // sidebar collapse / right panel / window resizes never re-render.
  const layoutRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const layout = layoutRef.current;
    const main = mainRef.current;
    if (!layout || !main) return;
    if (isMobile) {
      layout.style.removeProperty('--control-bar-center');
      layout.style.removeProperty('--control-bar-max-width');
      return;
    }
    const update = () => {
      const rect = main.getBoundingClientRect();
      layout.style.setProperty('--control-bar-center', `${rect.left + rect.width / 2}px`);
      layout.style.setProperty('--control-bar-max-width', `${rect.width - 32}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(main);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [isMobile]);

  // Room the pinned action takes on the right (its width + the actions gap),
  // read by the header actions and child toolbars as `--main-pinned-action-space`.
  // Mobile: it sits in the top bar row (sidebar toggle), so nothing reserves room.
  const pinnedActionRef = useRef<HTMLDivElement>(null);
  const hasPinnedAction = Boolean(pinnedAction);
  useEffect(() => {
    const main = mainRef.current;
    const pinned = pinnedActionRef.current;
    if (!main) return;
    if (!pinned || isMobile) {
      main.style.removeProperty('--main-pinned-action-space');
      return;
    }
    const update = () => {
      main.style.setProperty('--main-pinned-action-space', `${pinned.offsetWidth + 12}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(pinned);
    return () => observer.disconnect();
  }, [hasPinnedAction, isMobile]);

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
    <div ref={layoutRef} className={styles.layout}>
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
      <div className={styles.content} data-has-right={rightSidebar ? '' : undefined}>
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
        <main ref={mainRef} className={`${styles.main}${fullHeightContent ? ` ${styles.mainSolid}` : ''}`}>
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

          {pinnedAction && (
            <div ref={pinnedActionRef} className={styles.pinnedAction}>
              {pinnedAction}
            </div>
          )}

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
            className={`${styles.mainBody} ${
              fullHeightContent
                ? styles.mainBodyNoScroll
                : !scrollableBody
                  ? styles.mainBodyContained
                  : ''
            }`}
            ref={mainBodyRef}
          >
            {children}
          </div>
        </main>

        {/* Right Sidebar — desktop, or mobile when not presented as a bottom sheet */}
        {/* `custom` reaches the panel while it leaves, too */}
        <AnimatePresence custom={rightSidebarTransition}>
          {rightSidebar && !(isMobile && rightSidebarAsSheet) && (
            <motion.aside
              className={styles.rightSidebar}
              custom={rightSidebarTransition}
              variants={RIGHT_SIDEBAR_VARIANTS}
              initial="hidden"
              animate="shown"
              exit="leaving"
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
          placeholder={controlBarPlaceholder}
          leading={controlBarLeading}
          onModeChange={onControlBarModeChange}
          above={controlBarAbove}
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

