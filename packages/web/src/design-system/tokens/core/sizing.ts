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
    fontSize: 64,
    lineHeight: 80,
    fontWeight: 600,
    letterSpacing: 0,
  },
  'heading-lg': {
    fontSize: 32,
    lineHeight: 32,
    fontWeight: 600,
    letterSpacing: 0,
  },
  'heading-md': {
    fontSize: 24,
    lineHeight: 24,
    fontWeight: 600,
    letterSpacing: 0,
  },
  'heading-sm': {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: 600,
    letterSpacing: 0,
  },
  'body-lg': {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: 500,
    letterSpacing: 0,
  },
  'body-md': {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
    letterSpacing: 0,
  },
  'body-sm': {
    fontSize: 13,
    lineHeight: 13,
    fontWeight: 500,
    letterSpacing: 0,
  },
  'label-md': {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: 400,
    letterSpacing: 0,
  },
  'label-sm': {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: 500,
    letterSpacing: 0,
  },
} as const;

// ============================================================================
// RADIUS
// ============================================================================

export const radius = {
  'radius-sm': 12,
  'radius-md': 16,
  'radius-lg': 24,
  'radius-round': 9999,
  'button-radius': '{radius.radius-md}',
  'button-icon-radius': '{radius.radius-md}',
  'button-ring-radius': 18,
  'calendar-day-button-radius': '{radius.radius-sm}',
  'chip-radius': '{radius.radius-md}',
  'chip-ring-radius': 20,
  'tooltip-radius': '{radius.radius-sm}',
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
  fine: 24,
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
