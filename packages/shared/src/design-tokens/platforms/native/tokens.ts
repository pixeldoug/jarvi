/**
 * Design Tokens for React Native
 * Generated from Figma tokens
 * DO NOT EDIT MANUALLY
 * 
 * Import and use directly in your React Native StyleSheet.create() calls
 */

/* ========================================
   PRIMITIVE TOKENS
   ======================================== */

export const colors = {
  "gray20": "#F9FAFA",
  "gray50": "#F7F8F9",
  "gray100": "#E8EAED",
  "gray200": "#D8DDE0",
  "gray300": "#C7CDD3",
  "gray400": "#B5BCC4",
  "gray500": "#A0ABB4",
  "gray600": "#8A97A2",
  "gray700": "#757F88",
  "gray800": "#596269",
  "gray900": "#34373C",
  "gray950": "#18181B",
  "brandRimary": "#000000",
  "brandOlt": "#000000",
  "systemReen": "#000000",
  "systemEllow": "#000000",
  "systemEd": "#000000",
  "systemLue": "#000000",
  "systemUrple": "#000000",
  "bwWhite": "#FFFFFF",
  "bwTransparent": "#FFFFFF",
  "bwWhitetransparent10": "#FFFFFF",
  "bwWhitetransparent15": "#FFFFFF",
  "bwWhitetransparent20": "#FFFFFF",
  "bwWhitetransparent30": "#FFFFFF",
  "bwWhitetransparent60": "#FFFFFF",
  "bwWhitetransparent80": "#FFFFFF",
  "bwBlack": "#09090B",
  "bwBlacktransparent10": "#09090B",
  "bwBlacktransparent15": "#09090B",
  "bwBlacktransparent20": "#09090B",
  "bwBlacktransparent30": "#09090B",
  "bwBlacktransparent60": "#09090B",
  "bwBlacktransparent80": "#09090B"
} as const;

export const fontFamily = {
  "font-display": "Georgia",
  "font-ui": "Poppins",
  "font-mono": "Menlo"
} as const;

export const fontWeight = {
  "thin": 100,
  "extralight": 200,
  "light": 300,
  "normal": 400,
  "medium": 500,
  "semibold": 600,
  "bold": 700,
  "extrabold": 800,
  "black": 900
} as const;

export const fontStyle = {
  "italic": "italic",
  "not-italic": "normal"
} as const;

export const letterSpacing = {
  "tighter": -0.800000011920929,
  "tight": -0.4000000059604645,
  "normal": 0,
  "wide": 0.4000000059604645,
  "wider": 0.800000011920929,
  "widest": 1.600000023841858
} as const;

export const spacing = {
  "0": 0,
  "1": 4,
  "2": 8,
  "3": 12,
  "4": 16,
  "5": 20,
  "6": 24,
  "7": 28,
  "8": 32,
  "9": 36,
  "10": 40,
  "11": 44,
  "12": 48,
  "14": 56,
  "15": 6,
  "16": 64,
  "20": 80,
  "24": 96,
  "25": 10,
  "28": 112,
  "32": 128,
  "35": 14,
  "36": 144,
  "40": 160,
  "44": 176,
  "48": 192,
  "52": 208,
  "56": 224,
  "60": 240,
  "64": 256,
  "72": 288,
  "80": 320,
  "96": 384,
  "275": 11,
  "325": 13,
  "375": 15,
  "px": 1,
  "05": 2
} as const;

export const opacity = {
  "opacity10": 0.1,
  "opacity15": 0.15,
  "opacity20": 0.2,
  "opacity30": 0.3,
  "opacity60": 0.6,
  "opacity80": 0.8
} as const;

/* ========================================
   SEMANTIC TOKENS (THEMES)
   ======================================== */

export const lightTheme = {
  ..."contentContent-primary": "#34373C",
  "contentContent-secondary": "#A0ABB4",
  "contentContent-tertiary": "#B5BCC4",
  "contentContent-accent": "#F3F1FC",
  "contentContent-subtle": "#EEE9FE",
  "contentContent-disabled": "#B5BCC4",
  "contentContent-positive": "#16A34A",
  "contentContent-negative": "#DC2626",
  "contentContent-warning": "#D97706",
  "contentContent-info": "#6137F3",
  "surfaceSurface-primary": "#FFFFFF",
  "surfaceSurface-secondary": "#F7F8F9",
  "surfaceSurface-tertiary": "#E8EAED",
  "surfaceSurface-accent": "#4F26E4",
  "surfaceSurface-accent-subtle": "#F3F1FC",
  "bordersBorder": "#D8DDE0",
  "controlControl-bg": "#FFFFFF",
  "controlControl-content-placeholder": "{Semantic.content.content-tertiary}",
  "controlControl-content": "{Semantic.content.content-primary}",
  "controlControl-border-active": "#6137F3",
  "controlControl-focusring": "#2563EB",
  "elevationElevation-base": "#09090B",
  "elevationElevation-spread": "#09090B",
  // Component tokens
  ..."buttonBg-disabled": "#E8EAED",
  "buttonContent-disabled": "{Semantic.content.content-disabled}",
  "buttonPrimaryBg-default": "{Semantic.surface.surface-accent}",
  "buttonPrimaryBg-hover": "#3812B7",
  "buttonPrimaryBg-active": "#4F26E4",
  "buttonPrimaryContent-default": "#FFFFFF",
  "buttonPrimaryContent-hover": "#FFFFFF",
  "buttonPrimaryContent-active": "#FFFFFF",
  "buttonDestructiveBg-default": "#B91C1C",
  "buttonDestructiveBg-hover": "#991B1B",
  "buttonDestructiveBg-active": "#7F1D1D",
  "buttonDestructiveContent-default": "#FFFFFF",
  "buttonDestructiveContent-hover": "#FFFFFF",
  "buttonDestructiveContent-active": "#FFFFFF",
  "buttonSecondaryBg-default": "#FFFFFF",
  "buttonSecondaryBg-hover": "#E8EAED",
  "buttonSecondaryBg-active": "#EEE9FE",
  "buttonSecondaryContent-default": "{Semantic.content.content-primary}",
  "buttonSecondaryContent-hover": "#8A97A2",
  "buttonSecondaryContent-active": "#6137F3",
  "buttonSecondaryBorder-active": "#DED4FD",
  "buttonGhostBg-default": "#FFFFFF",
  "buttonGhostBg-hover": "#E8EAED",
  "buttonGhostBg-active": "#F7F8F9",
  "buttonGhostContent-default": "{Semantic.content.content-primary}",
  "buttonGhostContent-hover": "#8A97A2",
  "buttonGhostContent-active": "#596269",
  "calendarArrow-buttonBg": "#FFFFFF",
  "calendarArrow-buttonBg-hover": "#EEE9FE",
  "calendarArrow-buttonContent": "{Semantic.content.content-primary}",
  "calendarArrow-buttonContent-hover": "#6137F3",
  "calendarDay-buttonBg-default": "#FFFFFF",
  "calendarDay-buttonBg-hover": "#EEE9FE",
  "calendarDay-buttonBg-pressed": "#E8EAED",
  "calendarDay-buttonBg-disabled": "#E8EAED",
  "calendarDay-buttonBg-selected": "#6137F3",
  "calendarDay-buttonContent-default": "{Semantic.content.content-primary}",
  "calendarDay-buttonContent-hover": "#6137F3",
  "calendarDay-buttonContent-pressed": "#A0ABB4",
  "calendarDay-buttonContent-disabled": "{Semantic.content.content-disabled}",
  "calendarDay-buttonContent-selected": "#F3F1FC",
  "calendarDay-buttonCurrent-bg-default": "#E8EAED",
  "calendarDay-buttonCurrent-content-default": "#757F88",
  "control-barBg-default": "#18181B",
  "control-barBg-active": "#18181B",
  "control-barBorder": "#34373C",
  "chipBg-disabled": "#E8EAED",
  "chipContent-disabled": "{Semantic.content.content-disabled}",
  "chipBg-default": "#FFFFFF",
  "chipBg-hover": "#E8EAED",
  "chipBg-active": "#EEE9FE",
  "chipContent-active": "#6137F3",
  "chipContent-hover": "#8A97A2",
  "chipBorder-active": "#DED4FD",
  "list-itemBg-disabled": "#FFFFFF",
  "list-itemContent-disabled": "{Semantic.content.content-disabled}",
  "list-itemBg-default": "#FFFFFF",
  "list-itemBg-hover": "#F7F8F9",
  "list-itemBg-active": "#F3F1FC",
  "list-itemContent-hover": "{Semantic.content.content-primary}",
  "list-itemContent-active": "#3812B7",
  "dialogBg-overlay": "#09090B"
} as const;

export const darkTheme = {
  ..."contentContent-primary": "#F7F8F9",
  "contentContent-secondary": "#B5BCC4",
  "contentContent-tertiary": "#A0ABB4",
  "contentContent-accent": "#F3F1FC",
  "contentContent-subtle": "#EEE9FE",
  "contentContent-disabled": "#34373C",
  "contentContent-positive": "#4ADE80",
  "contentContent-negative": "#F87171",
  "contentContent-warning": "#FBBF24",
  "contentContent-info": "#8D6EF7",
  "surfaceSurface-primary": "#18181B",
  "surfaceSurface-secondary": "#34373C",
  "surfaceSurface-tertiary": "#596269",
  "surfaceSurface-accent": "#4F26E4",
  "surfaceSurface-accent-subtle": "#160F2B",
  "bordersBorder": "#34373C",
  "controlControl-bg": "{Semantic.surface.surface-primary}",
  "controlControl-content-placeholder": "{Semantic.content.content-tertiary}",
  "controlControl-content": "{Semantic.content.content-primary}",
  "controlControl-border-active": "#7048F5",
  "controlControl-focusring": "#1D4ED8",
  "elevationElevation-base": "#FFFFFF",
  "elevationElevation-spread": "#FFFFFF",
  // Component tokens
  ..."buttonBg-disabled": "#34373C",
  "buttonContent-disabled": "#757F88",
  "buttonPrimaryBg-default": "{Semantic.surface.surface-accent}",
  "buttonPrimaryBg-hover": "#3812B7",
  "buttonPrimaryBg-active": "#4F26E4",
  "buttonPrimaryContent-default": "#FFFFFF",
  "buttonPrimaryContent-hover": "#FFFFFF",
  "buttonPrimaryContent-active": "#FFFFFF",
  "buttonDestructiveBg-default": "#DC2626",
  "buttonDestructiveBg-hover": "#B91C1C",
  "buttonDestructiveBg-active": "#991B1B",
  "buttonDestructiveContent-default": "#FFFFFF",
  "buttonDestructiveContent-hover": "#FFFFFF",
  "buttonDestructiveContent-active": "#FFFFFF",
  "buttonSecondaryBg-default": "#09090B",
  "buttonSecondaryBg-hover": "#34373C",
  "buttonSecondaryBg-active": "#1D1440",
  "buttonSecondaryContent-default": "{Semantic.content.content-primary}",
  "buttonSecondaryContent-hover": "{Semantic.content.content-primary}",
  "buttonSecondaryContent-active": "#8D6EF7",
  "buttonSecondaryBorder-active": "#4F26E4",
  "buttonGhostBg-default": "#FFFFFF",
  "buttonGhostBg-hover": "#34373C",
  "buttonGhostBg-active": "#34373C",
  "buttonGhostContent-default": "{Semantic.content.content-primary}",
  "buttonGhostContent-hover": "{Semantic.content.content-secondary}",
  "buttonGhostContent-active": "#D8DDE0",
  "calendarArrow-buttonBg": "#FFFFFF",
  "calendarArrow-buttonBg-hover": "#3730A3",
  "calendarArrow-buttonContent": "{Semantic.content.content-disabled}",
  "calendarArrow-buttonContent-hover": "#DED4FD",
  "calendarDay-buttonBg-default": "#FFFFFF",
  "calendarDay-buttonBg-hover": "#3812B7",
  "calendarDay-buttonBg-pressed": "#34373C",
  "calendarDay-buttonBg-disabled": "#34373C",
  "calendarDay-buttonBg-selected": "#4F26E4",
  "calendarDay-buttonContent-default": "{Semantic.content.content-primary}",
  "calendarDay-buttonContent-hover": "#DED4FD",
  "calendarDay-buttonContent-pressed": "#F3F1FC",
  "calendarDay-buttonContent-disabled": "#757F88",
  "calendarDay-buttonContent-selected": "#F3F1FC",
  "calendarDay-buttonCurrent-bg-default": "#34373C",
  "calendarDay-buttonCurrent-content-default": "#C7CDD3",
  "control-barBg-default": "#34373C",
  "control-barBg-active": "#18181B",
  "control-barBorder": "#18181B",
  "chipBg-disabled": "#18181B",
  "chipContent-disabled": "{Semantic.content.content-disabled}",
  "chipBg-default": "#FFFFFF",
  "chipBg-hover": "#34373C",
  "chipBg-active": "#1D1440",
  "chipContent-active": "#8D6EF7",
  "chipContent-hover": "{Semantic.content.content-primary}",
  "chipBorder-active": "#6137F3",
  "list-itemBg-disabled": "#FFFFFF",
  "list-itemContent-disabled": "{Semantic.content.content-disabled}",
  "list-itemBg-default": "#FFFFFF",
  "list-itemBg-hover": "#18181B",
  "list-itemBg-active": "#4F26E4",
  "list-itemContent-hover": "{Semantic.content.content-primary}",
  "list-itemContent-active": "#EEE9FE",
  "dialogBg-overlay": "#09090B"
} as const;

/* ========================================
   TYPES
   ======================================== */

export type ThemeMode = 'light' | 'dark';
export type Theme = typeof lightTheme;
export type ColorKey = keyof typeof colors;
export type SpacingKey = keyof typeof spacing;
export type FontFamilyKey = keyof typeof fontFamily;

/**
 * Get theme based on mode
 */
export function getTheme(mode: ThemeMode): Theme {
  return mode === 'dark' ? darkTheme : lightTheme;
}

/* ========================================
   USAGE EXAMPLE
   ======================================== */

/*
import { StyleSheet } from 'react-native';
import { colors, spacing, lightTheme, fontFamily } from '@shared/design-tokens/platforms/native';

const styles = StyleSheet.create({
  button: {
    backgroundColor: lightTheme.semanticSurfaceSurfaceAccent,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: spacing[2],
  },
  text: {
    color: lightTheme.semanticContentContentPrimary,
    fontFamily: fontFamily['font-ui'],
  },
});
*/
