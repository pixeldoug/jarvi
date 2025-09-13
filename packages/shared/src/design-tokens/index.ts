/**
 * Design Tokens - Jarvi
 * 
 * Ponto de entrada para todos os design tokens
 */

// ============================================================================
// EXPORTS
// ============================================================================

export * from './colors';
export * from './typography';
export * from './spacing';

// ============================================================================
// DESIGN TOKENS COMPLETOS
// ============================================================================

export const designTokens = {
  colors: {
    ...require('./colors').colors,
    semantic: require('./colors').semanticColors,
    light: require('./colors').lightTheme,
    dark: require('./colors').darkTheme,
  },
  typography: {
    fonts: require('./typography').fonts,
    sizes: require('./typography').fontSizes,
    weights: require('./typography').fontWeights,
    lineHeights: require('./typography').lineHeights,
    letterSpacings: require('./typography').letterSpacings,
  },
  spacing: require('./spacing').spacing,
  borderRadius: require('./spacing').borderRadius,
  boxShadow: require('./spacing').boxShadow,
  zIndex: require('./spacing').zIndex,
} as const;

