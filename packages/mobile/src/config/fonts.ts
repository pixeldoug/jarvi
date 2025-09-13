/**
 * Font Configuration - Jarvi Mobile
 * 
 * Configuração de fontes para o aplicativo mobile
 * seguindo o design system.
 */

// ============================================================================
// CONFIGURAÇÃO DE FONTES
// ============================================================================

export const fontConfig = {
  // Fontes principais
  sans: {
    fontFamily: 'Inter',
    fontWeight: {
      thin: '100',
      extralight: '200',
      light: '300',
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
      extrabold: '800',
      black: '900',
    },
  },
  
  mono: {
    fontFamily: 'JetBrains Mono',
    fontWeight: {
      normal: '400',
      medium: '500',
      bold: '700',
    },
  },
  
  display: {
    fontFamily: 'Inter',
    fontWeight: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    },
  },
};

// ============================================================================
// TAMANHOS DE FONTE
// ============================================================================

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
  '5xl': 48,
  '6xl': 60,
  '7xl': 72,
  '8xl': 96,
  '9xl': 128,
};

// ============================================================================
// ALTURAS DE LINHA
// ============================================================================

export const lineHeight = {
  none: 1,
  tight: 1.25,
  snug: 1.375,
  normal: 1.5,
  relaxed: 1.625,
  loose: 2,
};

// ============================================================================
// ESPAÇAMENTO DE LETRAS
// ============================================================================

export const letterSpacing = {
  tighter: -0.05,
  tight: -0.025,
  normal: 0,
  wide: 0.025,
  wider: 0.05,
  widest: 0.1,
};

// ============================================================================
// UTILITÁRIOS
// ============================================================================

/**
 * Função para obter estilo de fonte
 */
export function getFontStyle(
  family: keyof typeof fontConfig = 'sans',
  size: keyof typeof fontSize = 'base',
  weight: keyof typeof fontConfig['sans']['fontWeight'] = 'normal',
  lineHeightValue: keyof typeof lineHeight = 'normal',
  letterSpacingValue: keyof typeof letterSpacing = 'normal'
) {
  return {
    fontFamily: fontConfig[family].fontFamily,
    fontSize: fontSize[size],
    fontWeight: fontConfig[family].fontWeight[weight],
    lineHeight: fontSize[size] * lineHeight[lineHeightValue],
    letterSpacing: letterSpacing[letterSpacingValue],
  };
}

/**
 * Função para obter estilo de texto
 */
export function getTextStyle(
  size: keyof typeof fontSize = 'base',
  weight: keyof typeof fontConfig['sans']['fontWeight'] = 'normal',
  lineHeightValue: keyof typeof lineHeight = 'normal'
) {
  return {
    fontFamily: fontConfig.sans.fontFamily,
    fontSize: fontSize[size],
    fontWeight: fontConfig.sans.fontWeight[weight],
    lineHeight: fontSize[size] * lineHeight[lineHeightValue],
  };
}

/**
 * Função para obter estilo de título
 */
export function getTitleStyle(
  size: keyof typeof fontSize = '2xl',
  weight: keyof typeof fontConfig['display']['fontWeight'] = 'bold'
) {
  return {
    fontFamily: fontConfig.display.fontFamily,
    fontSize: fontSize[size],
    fontWeight: fontConfig.display.fontWeight[weight],
    lineHeight: fontSize[size] * lineHeight.tight,
  };
}

/**
 * Função para obter estilo de código
 */
export function getCodeStyle(
  size: keyof typeof fontSize = 'sm',
  weight: keyof typeof fontConfig['mono']['fontWeight'] = 'normal'
) {
  return {
    fontFamily: fontConfig.mono.fontFamily,
    fontSize: fontSize[size],
    fontWeight: fontConfig.mono.fontWeight[weight],
    lineHeight: fontSize[size] * lineHeight.normal,
  };
}

