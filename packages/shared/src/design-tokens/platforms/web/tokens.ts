/**
 * Web Token Types
 * Generated TypeScript types for CSS variables
 * Provides autocomplete support for design tokens
 */

// Re-export core tokens for programmatic access
export * from '../../core';

/**
 * CSS Variable names as TypeScript types
 * Use these with `var(--variable-name)` in your CSS
 */
export type CSSVariable = 
  | `--color-${string}`
  | `--font-${string}`
  | `--spacing-${string}`
  | `--opacity-${string}`
  | `--semantic-${string}`
  | `--component-${string}`;

/**
 * Helper function to get CSS variable
 * @param varName CSS variable name without --
 * @returns CSS var() function string
 */
export function cssVar(varName: string): string {
  return `var(--${varName})`;
}
