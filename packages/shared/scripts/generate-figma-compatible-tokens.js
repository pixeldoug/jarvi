#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Script otimizado para gerar tokens compatíveis com o Figma
 * Foca apenas nos tipos que o Design Tokens Manager aceita
 */

// Carregar cores do arquivo colors.ts
const { colors: sourceColors } = require('../dist/design-tokens/colors');

// Mapear cores para o formato do Figma
const colors = {
  primary: sourceColors.primary,
  secondary: sourceColors.secondary,
  neutral: {
    0: sourceColors.white,
    50: sourceColors.neutral[50],
    100: sourceColors.neutral[100],
    200: sourceColors.neutral[200],
    300: sourceColors.neutral[300],
    400: sourceColors.neutral[400],
    500: sourceColors.neutral[500],
    600: sourceColors.neutral[600],
    700: sourceColors.neutral[700],
    800: sourceColors.neutral[800],
    900: sourceColors.neutral[900],
    950: sourceColors.black,
  },
  semantic: {
    success: {
      50: '#f0fdf4',
      100: '#dcfce7',
      200: '#bbf7d0',
      300: '#86efac',
      400: '#4ade80',
      500: '#22c55e',
      600: '#16a34a',
      700: '#15803d',
      800: '#166534',
      900: '#14532d',
      950: '#052e16',
    },
    warning: {
      50: '#fffbeb',
      100: '#fef3c7',
      200: '#fde68a',
      300: '#fcd34d',
      400: '#fbbf24',
      500: '#f59e0b',
      600: '#d97706',
      700: '#b45309',
      800: '#92400e',
      900: '#78350f',
      950: '#451a03',
    },
    error: {
      50: '#fef2f2',
      100: '#fee2e2',
      200: '#fecaca',
      300: '#fca5a5',
      400: '#f87171',
      500: '#ef4444',
      600: '#dc2626',
      700: '#b91c1c',
      800: '#991b1b',
      900: '#7f1d1d',
      950: '#450a0a',
    },
    info: {
      50: '#eff6ff',
      100: '#dbeafe',
      200: '#bfdbfe',
      300: '#93c5fd',
      400: '#60a5fa',
      500: '#3b82f6',
      600: '#2563eb',
      700: '#1d4ed8',
      800: '#1e40af',
      900: '#1e3a8a',
      950: '#172554',
    },
  },
};

// Tipografia (apenas os tipos aceitos pelo Figma)
const typography = {
  fontFamily: {
    sans: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
    mono: 'JetBrains Mono, Fira Code, Monaco, Consolas, monospace',
    display: 'Inter, system-ui, sans-serif',
  },
  fontSize: {
    xs: '12px',
    sm: '14px',
    base: '16px',
    lg: '18px',
    xl: '20px',
    '2xl': '24px',
    '3xl': '30px',
    '4xl': '36px',
    '5xl': '48px',
    '6xl': '60px',
    '7xl': '72px',
    '8xl': '96px',
    '9xl': '128px',
  },
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
};

// Espaçamentos (usando os números do spacing.ts)
const spacing = {
  none: '0px',
  px: '1px',
  1: '4px',     // 0.25rem
  2: '8px',     // 0.5rem
  3: '12px',    // 0.75rem
  4: '16px',    // 1rem
  5: '20px',    // 1.25rem
  6: '24px',    // 1.5rem
  7: '28px',    // 1.75rem
  8: '32px',    // 2rem
  9: '36px',    // 2.25rem
  10: '40px',   // 2.5rem
  11: '44px',   // 2.75rem
  12: '48px',   // 3rem
  14: '56px',   // 3.5rem
  16: '64px',   // 4rem
  20: '80px',   // 5rem
  24: '96px',   // 6rem
  28: '112px',  // 7rem
  32: '128px',  // 8rem
  36: '144px',  // 9rem
  40: '160px',  // 10rem
  44: '176px',  // 11rem
  48: '192px',  // 12rem
  52: '208px',  // 13rem
  56: '224px',  // 14rem
  60: '240px',  // 15rem
  64: '256px',  // 16rem
  72: '288px',  // 18rem
  80: '320px',  // 20rem
  96: '384px',  // 24rem
};

// Border radius (convertido para dimension)
const borderRadius = {
  none: '0px',
  sm: '2px',
  base: '4px',
  md: '6px',
  lg: '8px',
  xl: '12px',
  '2xl': '16px',
  '3xl': '24px',
  full: '9999px',
};

/**
 * Converte objeto para formato Design Tokens Standard
 */
function convertToDesignTokensStandard(obj, prefix = '') {
  const result = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const tokenKey = prefix ? `${prefix}.${key}` : key;
    
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Se é um objeto, recursivamente converter
      Object.assign(result, convertToDesignTokensStandard(value, tokenKey));
    } else {
      // Se é um valor primitivo, criar token
      result[tokenKey] = {
        $type: getTokenType(value, tokenKey),
        $value: value,
        $description: `Token ${tokenKey} do sistema Jarvi`,
      };
    }
  }
  
  return result;
}

/**
 * Determina o tipo do token baseado no valor e contexto
 */
function getTokenType(value, key = '') {
  if (typeof value === 'string') {
    // Verificações específicas primeiro
    if (key.includes('fontFamily') || key.includes('font-family')) return 'string';
    if (key.includes('fontWeight') || key.includes('font-weight')) return 'string';
    
    // Verificações gerais depois
    if (value.startsWith('#')) return 'color';
    if (value.includes('px') || value.includes('em') || value.includes('rem')) return 'dimension';
    return 'string';
  }
  return 'string';
}

/**
 * Gera o arquivo de tokens otimizado para Figma
 */
function generateFigmaTokens() {
  console.log('🎨 Gerando tokens otimizados para Figma...');
  
  try {
    // Converter apenas os tokens compatíveis
    const tokens = {
      colors: convertToDesignTokensStandard(colors),
      typography: convertToDesignTokensStandard(typography),
      spacing: convertToDesignTokensStandard(spacing),
      borderRadius: convertToDesignTokensStandard(borderRadius),
    };
    
    // Garantir que o diretório existe
    const outputDir = path.join(__dirname, '../dist/tokens');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Salvar arquivo
    const outputPath = path.join(outputDir, 'figma-compatible-tokens.json');
    fs.writeFileSync(outputPath, JSON.stringify(tokens, null, 2));
    
    // Contar tokens
    const totalTokens = Object.keys(tokens).reduce((count, category) => {
      return count + Object.keys(tokens[category]).length;
    }, 0);
    
    console.log(`✅ Tokens gerados: ${outputPath}`);
    console.log(`📊 Total de tokens: ${totalTokens}`);
    console.log('🎉 Geração concluída!');
    console.log('');
    console.log('📋 Categorias incluídas:');
    console.log('  - colors (primary, secondary, neutral, semantic)');
    console.log('  - typography (fontFamily, fontSize, fontWeight)');
    console.log('  - spacing (dimensões)');
    console.log('  - borderRadius (dimensões)');
    console.log('');
    console.log('🚀 Use este arquivo no Figma para melhor compatibilidade!');
    
  } catch (error) {
    console.error('❌ Erro na geração:', error.message);
    process.exit(1);
  }
}

// Executar
generateFigmaTokens();
