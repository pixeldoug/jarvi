/**
 * Typography Tokens
 * Generated from Figma
 * DO NOT EDIT MANUALLY
 */

export const typography = {
  "fontFamily": {
    "font-display": "Georgia",
    "font-ui": "Poppins",
    "font-mono": "Menlo"
  },
  "fontSize": {},
  "fontWeight": {
    "thin": 100,
    "extralight": 200,
    "light": 300,
    "normal": 400,
    "medium": 500,
    "semibold": 600,
    "bold": 700,
    "extrabold": 800,
    "black": 900
  },
  "fontStyle": {
    "italic": "italic",
    "not-italic": "normal"
  },
  "letterSpacing": {
    "tighter": -0.800000011920929,
    "tight": -0.4000000059604645,
    "normal": 0,
    "wide": 0.4000000059604645,
    "wider": 0.800000011920929,
    "widest": 1.600000023841858
  }
} as const;

export type FontFamily = keyof typeof typography.fontFamily;
export type FontWeight = keyof typeof typography.fontWeight;
export type FontStyle = keyof typeof typography.fontStyle;
export type LetterSpacing = keyof typeof typography.letterSpacing;
