/**
 * Color Tokens
 * Generated from Figma
 * DO NOT EDIT MANUALLY
 */

export const colors = {
  "gray": {
    "20": "#F9FAFA",
    "50": "#F7F8F9",
    "100": "#E8EAED",
    "200": "#D8DDE0",
    "300": "#C7CDD3",
    "400": "#B5BCC4",
    "500": "#A0ABB4",
    "600": "#8A97A2",
    "700": "#757F88",
    "800": "#596269",
    "900": "#34373C",
    "950": "#18181B"
  },
  "brand": {
    "primary": {
      "50": "#F3F1FC",
      "100": "#EEE9FE",
      "200": "#DED4FD",
      "300": "#CDBDFC",
      "400": "#8D6EF7",
      "500": "#7048F5",
      "600": "#6137F3",
      "700": "#4F26E4",
      "800": "#3812B7",
      "900": "#1D1440",
      "950": "#160F2B"
    }
  },
  "system": {
    "green": {
      "50": "#F0FDF4",
      "100": "#DCFCE7",
      "200": "#BBF7D0",
      "300": "#86EFAC",
      "400": "#4ADE80",
      "500": "#22C55E",
      "600": "#16A34A",
      "700": "#15803D",
      "800": "#166534",
      "900": "#14532D",
      "950": "#052E16"
    },
    "yellow": {
      "50": "#FFFBEB",
      "100": "#FEF3C7",
      "200": "#FDE68A",
      "300": "#FCD34D",
      "400": "#FBBF24",
      "500": "#F59E0B",
      "600": "#D97706",
      "700": "#B45309",
      "800": "#92400E",
      "900": "#78350F",
      "950": "#451A03"
    },
    "red": {
      "50": "#FEF2F2",
      "100": "#FEE2E2",
      "200": "#FECACA",
      "300": "#FCA5A5",
      "400": "#F87171",
      "500": "#EF4444",
      "600": "#DC2626",
      "700": "#B91C1C",
      "800": "#991B1B",
      "900": "#7F1D1D",
      "950": "#450A0A"
    },
    "blue": {
      "50": "#EFF6FF",
      "100": "#DBEAFE",
      "200": "#BFDBFE",
      "300": "#93C5FD",
      "400": "#60A5FA",
      "500": "#3B82F6",
      "600": "#2563EB",
      "700": "#1D4ED8",
      "800": "#1E40AF",
      "900": "#1E3A8A",
      "950": "#172554"
    },
    "purple": {
      "50": "#EEF2FF",
      "100": "#E0E7FF",
      "200": "#C7D2FE",
      "300": "#A5B4FC",
      "400": "#818CF8",
      "500": "#6366F1",
      "600": "#4F46E5",
      "700": "#4338CA",
      "800": "#3730A3",
      "900": "#312E81",
      "950": "#1E1B4B"
    }
  },
  "bw": {
    "white": "#FFFFFF",
    "transparent": "rgba(255, 255, 255, 0)",
    "white-transparent-05": "rgba(255, 255, 255, 0.05)",
    "white-transparent-10": "rgba(255, 255, 255, 0.1)",
    "white-transparent-15": "rgba(255, 255, 255, 0.15)",
    "white-transparent-20": "rgba(255, 255, 255, 0.2)",
    "white-transparent-30": "rgba(255, 255, 255, 0.3)",
    "white-transparent-60": "rgba(255, 255, 255, 0.6)",
    "white-transparent-80": "rgba(255, 255, 255, 0.8)",
    "black": "#09090B",
    "black-transparent-05": "rgba(9, 9, 11, 0.05)",
    "black-transparent-10": "rgba(9, 9, 11, 0.1)",
    "black-transparent-15": "rgba(9, 9, 11, 0.15)",
    "black-transparent-20": "rgba(9, 9, 11, 0.2)",
    "black-transparent-30": "rgba(9, 9, 11, 0.3)",
    "black-transparent-60": "rgba(9, 9, 11, 0.6)",
    "black-transparent-80": "rgba(9, 9, 11, 0.8)"
  }
} as const;

export type ColorCategory = keyof typeof colors;
export type ColorShade<T extends ColorCategory> = keyof typeof colors[T];
