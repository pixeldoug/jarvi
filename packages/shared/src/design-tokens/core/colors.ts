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
    "rimary": "#000000",
    "olt": "#000000"
  },
  "system": {
    "reen": "#000000",
    "ellow": "#000000",
    "ed": "#000000",
    "lue": "#000000",
    "urple": "#000000"
  },
  "bw": {
    "white": "#FFFFFF",
    "transparent": "#FFFFFF",
    "whitetransparent10": "#FFFFFF",
    "whitetransparent15": "#FFFFFF",
    "whitetransparent20": "#FFFFFF",
    "whitetransparent30": "#FFFFFF",
    "whitetransparent60": "#FFFFFF",
    "whitetransparent80": "#FFFFFF",
    "black": "#09090B",
    "blacktransparent10": "#09090B",
    "blacktransparent15": "#09090B",
    "blacktransparent20": "#09090B",
    "blacktransparent30": "#09090B",
    "blacktransparent60": "#09090B",
    "blacktransparent80": "#09090B"
  }
} as const;

export type ColorCategory = keyof typeof colors;
export type ColorShade<T extends ColorCategory> = keyof typeof colors[T];
