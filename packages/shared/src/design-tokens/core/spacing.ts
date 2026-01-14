/**
 * Spacing & Size Tokens
 * Generated from Figma
 * DO NOT EDIT MANUALLY
 */

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

export type SpacingKey = keyof typeof spacing;
export type OpacityKey = keyof typeof opacity;
