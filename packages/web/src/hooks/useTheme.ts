/**
 * Hook useTheme para Web - Jarvi Design System
 * 
 * Este hook integra o ThemeContext do design system com funcionalidades
 * específicas da web, como persistência no localStorage e aplicação de classes CSS.
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

// ============================================================================
// TIPOS
// ============================================================================

interface UseThemeWebOptions {
  storageKey?: string;
  enableSystemTheme?: boolean;
  enableSmoothTransition?: boolean;
}

export type ThemeMode = 'light' | 'dark' | 'system';

// ============================================================================
// CONTEXT
// ============================================================================

interface ThemeContextType {
  theme: 'light' | 'dark';
  mode: ThemeMode;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
  isDark: boolean;
  isLight: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// ============================================================================
// PROVIDER
// ============================================================================

interface ThemeProviderProps {
  children: ReactNode;
  storageKey?: string;
  enableSystemTheme?: boolean;
  enableSmoothTransition?: boolean;
}

export function ThemeProvider({
  children,
  storageKey = 'jarvi-theme',
  enableSystemTheme = true,
  enableSmoothTransition = true,
}: ThemeProviderProps) {
  const themeHook = useThemeWeb({
    storageKey,
    enableSystemTheme,
    enableSmoothTransition,
  });

  return React.createElement(
    ThemeContext.Provider,
    { value: themeHook },
    children
  );
}

// ============================================================================
// HOOK PRINCIPAL
// ============================================================================

/**
 * Hook para gerenciar tema na aplicação web
 */
export function useThemeWeb(options: UseThemeWebOptions = {}) {
  const {
    storageKey = 'jarvi-theme',
    enableSystemTheme = true,
    enableSmoothTransition = true,
  } = options;

  // Implementação local do tema
  const [mode, setMode] = useState<ThemeMode>('light');
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('light');
  
  // Calcular o tema atual
  const theme = mode === 'system' ? systemTheme : mode;
  const isDark = theme === 'dark';
  const isLight = theme === 'light';
  
  // Detectar preferência do sistema
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemTheme(mediaQuery.matches ? 'dark' : 'light');

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Carregar tema do localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const savedTheme = localStorage.getItem(storageKey) as ThemeMode;
    if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
      setMode(savedTheme);
    }
  }, [storageKey]);

  // Salvar tema no localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(storageKey, mode);
  }, [mode, storageKey]);

  // Aplicar transição suave quando mudar de tema
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const root = document.documentElement;
    
    if (enableSmoothTransition) {
      root.style.transition = 'background-color 0.2s ease, color 0.2s ease';
    }

    // Aplicar classes CSS para TailwindCSS
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    
    // Aplicar classes CSS customizadas
    root.classList.remove('theme-light', 'theme-dark');
    root.classList.add(`theme-${theme}`);
    
    // Aplicar atributos para CSS
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-color-scheme', theme);
  }, [theme, isDark, enableSmoothTransition]);

  // Funções do tema
  const toggleTheme = () => {
    setMode(prev => prev === 'light' ? 'dark' : 'light');
  };
  
  const setTheme = (newMode: ThemeMode) => {
    setMode(newMode);
  };

  return {
    theme,
    mode,
    toggleTheme,
    setTheme,
    isDark,
    isLight,
    
    // Funcionalidades específicas da web
    storageKey,
    enableSystemTheme,
  };
}

// ============================================================================
// HOOKS ESPECÍFICOS
// ============================================================================

/**
 * Hook para usar o tema do contexto
 */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

/**
 * Hook para obter classes CSS do tema
 */
export function useThemeClasses() {
  const { isDark } = useTheme();
  
  return {
    // Propriedades esperadas pelos componentes
    themeClass: isDark ? 'dark' : 'light',
    isDark,
    // Classes de background
    bgPrimary: isDark ? 'bg-gray-900' : 'bg-white',
    bgSecondary: isDark ? 'bg-gray-800' : 'bg-gray-50',
    bgTertiary: isDark ? 'bg-gray-700' : 'bg-gray-100',
    
    // Classes de surface
    surfacePrimary: isDark ? 'bg-gray-800' : 'bg-white',
    surfaceSecondary: isDark ? 'bg-gray-700' : 'bg-gray-50',
    surfaceTertiary: isDark ? 'bg-gray-600' : 'bg-gray-100',
    surfaceElevated: isDark ? 'bg-gray-700' : 'bg-white',
    
    // Classes de texto
    textPrimary: isDark ? 'text-gray-100' : 'text-gray-900',
    textSecondary: isDark ? 'text-gray-300' : 'text-gray-600',
    textTertiary: isDark ? 'text-gray-400' : 'text-gray-500',
    textInverse: isDark ? 'text-gray-900' : 'text-white',
    textDisabled: isDark ? 'text-gray-500' : 'text-gray-400',
    
    // Classes de border
    borderPrimary: isDark ? 'border-gray-600' : 'border-gray-200',
    borderSecondary: isDark ? 'border-gray-500' : 'border-gray-300',
    borderFocus: isDark ? 'border-blue-400' : 'border-blue-500',
    borderError: isDark ? 'border-red-400' : 'border-red-500',
    
    // Classes de brand
    brandPrimary: isDark ? 'bg-blue-600' : 'bg-blue-500',
    brandSecondary: isDark ? 'bg-purple-600' : 'bg-purple-500',
    
    // Classes semânticas
    semanticSuccess: isDark ? 'bg-green-600' : 'bg-green-500',
    semanticWarning: isDark ? 'bg-yellow-600' : 'bg-yellow-500',
    semanticError: isDark ? 'bg-red-600' : 'bg-red-500',
    semanticInfo: isDark ? 'bg-blue-600' : 'bg-blue-500',
  };
}

/**
 * Hook para obter estilos inline do tema
 */
export function useThemeStyles() {
  const { isDark } = useTheme();
  
  return {
    // Estilos de background
    backgroundPrimary: { backgroundColor: isDark ? '#111827' : '#ffffff' },
    backgroundSecondary: { backgroundColor: isDark ? '#1f2937' : '#f9fafb' },
    backgroundTertiary: { backgroundColor: isDark ? '#374151' : '#f3f4f6' },
    
    // Estilos de surface
    surfacePrimary: { backgroundColor: isDark ? '#1f2937' : '#ffffff' },
    surfaceSecondary: { backgroundColor: isDark ? '#374151' : '#f9fafb' },
    surfaceTertiary: { backgroundColor: isDark ? '#4b5563' : '#f3f4f6' },
    surfaceElevated: { backgroundColor: isDark ? '#374151' : '#ffffff' },
    
    // Estilos de texto
    textPrimary: { color: isDark ? '#f9fafb' : '#111827' },
    textSecondary: { color: isDark ? '#d1d5db' : '#4b5563' },
    textTertiary: { color: isDark ? '#9ca3af' : '#6b7280' },
    textInverse: { color: isDark ? '#111827' : '#ffffff' },
    textDisabled: { color: isDark ? '#6b7280' : '#9ca3af' },
    
    // Estilos de border
    borderPrimary: { borderColor: isDark ? '#4b5563' : '#e5e7eb' },
    borderSecondary: { borderColor: isDark ? '#6b7280' : '#d1d5db' },
    borderFocus: { borderColor: isDark ? '#60a5fa' : '#3b82f6' },
    borderError: { borderColor: isDark ? '#f87171' : '#ef4444' },
    
    // Estilos de brand
    brandPrimary: { backgroundColor: isDark ? '#2563eb' : '#3b82f6' },
    brandSecondary: { backgroundColor: isDark ? '#7c3aed' : '#8b5cf6' },
    
    // Estilos semânticos
    semanticSuccess: { backgroundColor: isDark ? '#059669' : '#10b981' },
    semanticWarning: { backgroundColor: isDark ? '#d97706' : '#f59e0b' },
    semanticError: { backgroundColor: isDark ? '#dc2626' : '#ef4444' },
    semanticInfo: { backgroundColor: isDark ? '#2563eb' : '#3b82f6' },
  };
}
