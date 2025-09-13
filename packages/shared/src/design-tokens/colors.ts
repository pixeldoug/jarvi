/**
 * Design Tokens - Colors
 * 
 * Cores do design system Jarvi
 */

// ============================================================================
// CORES BASE
// ============================================================================

export const colors = {
  // Cores neutras
  white: '#ffffff',
  black: '#000000',
  
  // Cinzas
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  },
  
  // Cores primárias
  blue: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
    950: '#000000',
  },
  
  // Cores secundárias
  purple: {
    50: '#faf5ff',
    100: '#f3e8ff',
    200: '#e9d5ff',
    300: '#d8b4fe',
    400: '#c084fc',
    500: '#a855f7',
    600: '#9333ea',
    700: '#7c3aed',
    800: '#6b21a8',
    900: '#581c87',
  },
  
  // Cores semânticas
  green: {
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981',
    600: '#059669',
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
  },
  
  yellow: {
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
    900: '#78350f',
  },
  
  red: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
  },
} as const;

// ============================================================================
// CORES SEMÂNTICAS
// ============================================================================

export const semanticColors = {
  success: colors.green[500],
  warning: colors.yellow[500],
  error: colors.red[500],
  info: colors.blue[500],
} as const;

// ============================================================================
// CORES DO TEMA
// ============================================================================

export const lightTheme = {
  // Backgrounds
  background: {
    primary: colors.white,
    secondary: colors.gray[50],
    tertiary: colors.gray[100],
  },
  
  // Surfaces
  surface: {
    primary: colors.white,
    secondary: colors.gray[50],
    tertiary: colors.gray[100],
    elevated: colors.white,
  },
  
  // Text
  text: {
    primary: colors.gray[900],
    secondary: colors.gray[600],
    tertiary: colors.gray[500],
    inverse: colors.white,
    disabled: colors.gray[400],
  },
  
  // Borders
  border: {
    primary: colors.gray[200],
    secondary: colors.gray[300],
    focus: colors.blue[500],
    error: colors.red[500],
  },
  
  // Brand
  brand: {
    primary: colors.blue[500],
    secondary: colors.purple[500],
  },
  
  // Semantic
  semantic: {
    success: colors.green[500],
    warning: colors.yellow[500],
    error: colors.red[500],
    info: colors.blue[500],
  },
} as const;

export const darkTheme = {
  // Backgrounds
  background: {
    primary: colors.gray[900],
    secondary: colors.gray[800],
    tertiary: colors.gray[700],
  },
  
  // Surfaces
  surface: {
    primary: colors.gray[800],
    secondary: colors.gray[700],
    tertiary: colors.gray[600],
    elevated: colors.gray[700],
  },
  
  // Text
  text: {
    primary: colors.gray[100],
    secondary: colors.gray[300],
    tertiary: colors.gray[400],
    inverse: colors.gray[900],
    disabled: colors.gray[500],
  },
  
  // Borders
  border: {
    primary: colors.gray[600],
    secondary: colors.gray[500],
    focus: colors.blue[400],
    error: colors.red[400],
  },
  
  // Brand
  brand: {
    primary: colors.blue[400],
    secondary: colors.purple[400],
  },
  
  // Semantic
  semantic: {
    success: colors.green[400],
    warning: colors.yellow[400],
    error: colors.red[400],
    info: colors.blue[400],
  },
} as const;

// ============================================================================
// TIPOS
// ============================================================================

export type ColorScale = typeof colors.gray;
export type ThemeColors = typeof lightTheme;
export type SemanticColor = keyof typeof semanticColors;

