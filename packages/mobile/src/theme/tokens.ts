/**
 * Design tokens for the native app.
 *
 * Values mirror the web design system (packages/web/src/design-system/tokens),
 * which is generated from Figma. Copy new values from there; do not invent
 * colors here. `@jarvi/shared` design tokens are stale and must not be used.
 */

export const palette = {
  gray: {
    20: '#F9F9FA',
    50: '#EEEFF2',
    100: '#E8EAED',
    200: '#D8DBE0',
    300: '#C7CCD3',
    400: '#B5BBC4',
    500: '#A0A8B4',
    600: '#8A94A2',
    700: '#757D88',
    800: '#4B5058',
    900: '#2B2D31',
    950: '#18191B',
  },
  brand: {
    50: '#F3F1FC',
    100: '#EEE9FE',
    200: '#DED4FD',
    300: '#CDBDFC',
    400: '#8D6EF7',
    500: '#7048F5',
    600: '#6137F3',
    700: '#4F26E4',
    800: '#3812B7',
    900: '#1D1440',
    950: '#160F2B',
  },
  white: '#FFFFFF',
  black: '#09090B',
  whatsapp: '#25D366',
} as const;

export interface ThemeColors {
  contentPrimary: string;
  contentSecondary: string;
  contentTertiary: string;
  contentDisabled: string;
  contentPositive: string;
  contentNegative: string;
  contentWarning: string;
  contentInfo: string;
  contentOnAccent: string;
  surfacePrimary: string;
  surfaceSecondary: string;
  surfaceTertiary: string;
  surfaceAccent: string;
  surfaceAccentSubtle: string;
  /** Background behind grouped lists (settings, task editor). */
  surfaceGrouped: string;
  /** Cards and rows on top of `surfaceGrouped`. */
  surfaceCard: string;
  borderPrimary: string;
  /** Hairlines between rows inside a card (dark cards share borderPrimary's color). */
  separator: string;
  controlBorderActive: string;
  destructive: string;
}

const light: ThemeColors = {
  contentPrimary: '#18191B',
  contentSecondary: '#4B5058',
  contentTertiary: '#A0A8B4',
  contentDisabled: 'rgba(9, 9, 11, 0.15)',
  contentPositive: '#16A34A',
  contentNegative: '#DC2626',
  contentWarning: '#D97706',
  contentInfo: '#6137F3',
  contentOnAccent: '#FFFFFF',
  surfacePrimary: '#FFFFFF',
  surfaceSecondary: '#EEEFF2',
  surfaceTertiary: '#F9F9FA',
  surfaceAccent: '#4F26E4',
  surfaceAccentSubtle: '#F3F1FC',
  surfaceGrouped: '#F9F9FA',
  surfaceCard: '#FFFFFF',
  borderPrimary: '#D8DBE0',
  separator: '#D8DBE0',
  controlBorderActive: '#6137F3',
  destructive: '#B91C1C',
};

const dark: ThemeColors = {
  contentPrimary: '#EEEFF2',
  contentSecondary: '#B5BBC4',
  contentTertiary: '#A0A8B4',
  contentDisabled: 'rgba(255, 255, 255, 0.2)',
  contentPositive: '#4ADE80',
  contentNegative: '#F87171',
  contentWarning: '#FBBF24',
  contentInfo: '#8D6EF7',
  contentOnAccent: '#FFFFFF',
  surfacePrimary: '#18191B',
  surfaceSecondary: '#2B2D31',
  surfaceTertiary: '#4B5058',
  surfaceAccent: '#4F26E4',
  surfaceAccentSubtle: '#160F2B',
  surfaceGrouped: '#18191B',
  surfaceCard: '#2B2D31',
  borderPrimary: '#2B2D31',
  separator: '#4B5058',
  controlBorderActive: '#7048F5',
  destructive: '#B91C1C',
};

export const colorSchemes = { light, dark } as const;
export type ColorSchemeName = keyof typeof colorSchemes;

/** Plus Jakarta Sans files loaded in the root layout. */
export const fontFamily = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
} as const;

/** Mobile type scale from the web tokens (values below the 768px breakpoint). */
export const typography = {
  'heading-lg': { fontFamily: fontFamily.semibold, fontSize: 24, lineHeight: 31, letterSpacing: -0.5 },
  'heading-md': { fontFamily: fontFamily.semibold, fontSize: 20, lineHeight: 24, letterSpacing: -0.25 },
  'heading-sm': { fontFamily: fontFamily.semibold, fontSize: 18, lineHeight: 24, letterSpacing: -0.25 },
  'body-lg': { fontFamily: fontFamily.regular, fontSize: 17, lineHeight: 24, letterSpacing: 0.2 },
  'body-md': { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 21, letterSpacing: 0.2 },
  'body-sm': { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18, letterSpacing: 0.15 },
  'label-md': { fontFamily: fontFamily.medium, fontSize: 15, lineHeight: 22, letterSpacing: -0.25 },
  'label-sm': { fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 16, letterSpacing: -0.1 },
  /** A flag emoji sized to overflow a 24pt circle, so the circle shows only the flag (country picker). */
  'flag-fill': { fontSize: 32, lineHeight: 38 },
} as const;
export type TypographyVariant = keyof typeof typography;

export const radius = {
  sm: 12,
  md: 16,
  lg: 24,
  /** App-icon tile (56pt) on the sign-in screens. */
  icon: 20,
  /** Top corners of the sign-in sheet over the sky. */
  sheet: 36,
  round: 9999,
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;
