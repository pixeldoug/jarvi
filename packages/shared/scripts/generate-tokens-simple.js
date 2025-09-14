#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Script simples para gerar tokens para Figma
 * Lê diretamente dos arquivos TypeScript
 */

// Cores básicas
const colors = {
  primary: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9',
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
    900: '#0c4a6e',
    950: '#082f49',
  },
  secondary: {
    50: '#faf5ff',
    100: '#f3e8ff',
    200: '#e9d5ff',
    300: '#d8b4fe',
    400: '#c084fc',
    500: '#a855f7',
    600: '#9333ea',
    700: '#7c3aed',
    800: '#6b21a8',
    900: '#581c87',
    950: '#3b0764',
  },
  neutral: {
    0: '#ffffff',
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
    950: '#030712',
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

// Tipografia
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
    thin: 100,
    extralight: 200,
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
    black: 900,
  },
  lineHeight: {
    none: 1,
    tight: 1.25,
    snug: 1.375,
    normal: 1.5,
    relaxed: 1.625,
    loose: 2,
  },
  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0em',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em',
  },
};

// Espaçamentos
const spacing = {
  none: '0px',
  px: '1px',
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  '2xl': '48px',
  '3xl': '64px',
  '4xl': '96px',
  '5xl': '128px',
  '6xl': '192px',
};

// Efeitos
const effects = {
  borderRadius: {
    none: '0px',
    sm: '2px',
    base: '4px',
    md: '6px',
    lg: '8px',
    xl: '12px',
    '2xl': '16px',
    '3xl': '24px',
    full: '9999px',
  },
  boxShadow: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    base: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
    none: '0 0 #0000',
  },
};

// Animações
const animation = {
  duration: {
    75: '75ms',
    100: '100ms',
    150: '150ms',
    200: '200ms',
    300: '300ms',
    500: '500ms',
    700: '700ms',
    1000: '1000ms',
  },
  timingFunction: {
    linear: 'linear',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    'in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
};

// Z-Index
const zIndex = {
  0: 0,
  10: 10,
  20: 20,
  30: 30,
  40: 40,
  50: 50,
  dropdown: 1000,
  sticky: 1020,
  fixed: 1030,
  modal: 1040,
  popover: 1050,
  tooltip: 1060,
  toast: 1070,
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
    if (key.includes('boxShadow') || key.includes('box-shadow')) return 'string'; // Convertido para string
    if (key.includes('fontWeight') || key.includes('font-weight')) return 'string'; // Convertido para string
    if (key.includes('lineHeight') || key.includes('line-height')) return 'string'; // Convertido para string
    if (key.includes('letterSpacing') || key.includes('letter-spacing')) return 'string'; // Convertido para string
    
    // Verificações gerais depois
    if (value.startsWith('#')) return 'color';
    if (value.includes('px') || value.includes('em') || value.includes('rem')) return 'dimension';
    return 'string';
  }
  if (typeof value === 'number') {
    // Todos os números são convertidos para string para compatibilidade
    return 'string';
  }
  return 'string';
}

/**
 * Gera o arquivo de tokens
 */
function generateTokens() {
  console.log('🎨 Gerando tokens no formato padrão Design Tokens...');
  
  try {
    // Converter todos os tokens
    const allTokens = {
      ...convertToDesignTokensStandard(colors, 'colors'),
      ...convertToDesignTokensStandard(typography, 'typography'),
      ...convertToDesignTokensStandard(spacing, 'spacing'),
      ...convertToDesignTokensStandard(effects, 'effects'),
      ...convertToDesignTokensStandard(animation, 'animation'),
      ...convertToDesignTokensStandard(zIndex, 'zIndex'),
    };
    
    // Criar estrutura hierárquica
    const tokens = {
      colors: convertToDesignTokensStandard(colors),
      typography: convertToDesignTokensStandard(typography),
      spacing: convertToDesignTokensStandard(spacing),
      effects: convertToDesignTokensStandard(effects),
      animation: convertToDesignTokensStandard(animation),
      zIndex: convertToDesignTokensStandard(zIndex),
    };
    
    // Garantir que o diretório existe
    const outputDir = path.join(__dirname, '../dist/tokens');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Salvar arquivo
    const outputPath = path.join(outputDir, 'design-tokens-to-import-on-figma.json');
    fs.writeFileSync(outputPath, JSON.stringify(tokens, null, 2));
    
    console.log(`✅ Tokens gerados: ${outputPath}`);
    console.log(`📊 Total de tokens: ${Object.keys(allTokens).length}`);
    console.log('🎉 Geração concluída!');
    
  } catch (error) {
    console.error('❌ Erro na geração:', error.message);
    process.exit(1);
  }
}

// Executar
generateTokens();
