/**
 * Sizing Tokens - Generated from Figma
 * 
 * Typography and sizing system built upon primitives
 * @generated Do not edit manually
 */

// ============================================================================
// TYPOGRAPHY SIZING
// ============================================================================

export const typographySizing = {
  'display-lg': {
    fontSize: 60,
    lineHeight: 64,
    fontWeight: 600,
    letterSpacing: -2.5,
  },
  'heading-lg': {
    fontSize: 32,
    lineHeight: 36,
    fontWeight: 600,
    letterSpacing: -0.75,
  },
  'heading-md': {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: 600,
    letterSpacing: -0.5,
  },
  'heading-sm': {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: 600,
    letterSpacing: -0.25,
  },
  'body-lg': {
    fontSize: 16,
    lineHeight: 27,
    fontWeight: 450,
    letterSpacing: 0.25,
  },
  'body-md': {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: 450,
    letterSpacing: 0.20000000298023224,
  },
  'body-sm': {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 450,
    letterSpacing: 0.15000000596046448,
  },
  'label-md': {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: 500,
    letterSpacing: -0.25,
  },
  'label-sm': {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: 450,
    letterSpacing: -0.10000000149011612,
  },
} as const;

// ============================================================================
// RADIUS
// ============================================================================

export const radius = {
  sm: 12,
  md: 16,
  lg: 24,
  round: 9999,
  'button-radius': '{radius.md}',
  'button-icon-radius': '{radius.md}',
  'button-ring-radius': 18,
  'calendar-day-button-radius': '{radius.sm}',
  'chip-radius': '{radius.md}',
  'chip-ring-radius': 20,
  'tooltip-radius': '{radius.sm}',
} as const;

// ============================================================================
// CHIP SIZES
// ============================================================================

export const chipSizes = {
  'small-height': '{size.target.fine}',
  'medium-height': '{size.target.tight}',
} as const;

// ============================================================================
// TARGET SIZES
// ============================================================================

export const targetSizes = {
  fine: 28,
  tight: 36,
  compact: 40,
  standard: 48,
} as const;

// ============================================================================
// TYPES
// ============================================================================

export type TypographySizingKey = keyof typeof typographySizing;
export type RadiusKey = keyof typeof radius;
export type ChipSizeKey = keyof typeof chipSizes;
export type TargetSizeKey = keyof typeof targetSizes;
