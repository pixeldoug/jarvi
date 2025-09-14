#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Script para gerar tokens separados por categoria
 * Cria arquivos individuais para melhor organização
 */

// Cores básicas
const baseColors = {
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
};

// Cores semânticas
const semanticColors = {
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

// Border radius
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
 * Gera arquivos separados de tokens
 */
function generateSeparatedTokens() {
  console.log('🎨 Gerando tokens separados por categoria...');
  
  try {
    // Garantir que o diretório existe
    const outputDir = path.join(__dirname, '../dist/tokens');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // 1. Cores básicas
    const baseColorsTokens = convertToDesignTokensStandard(baseColors);
    const baseColorsPath = path.join(outputDir, 'base-colors.json');
    fs.writeFileSync(baseColorsPath, JSON.stringify({ colors: baseColorsTokens }, null, 2));
    
    // 2. Cores semânticas
    const semanticColorsTokens = convertToDesignTokensStandard(semanticColors);
    const semanticColorsPath = path.join(outputDir, 'semantic-colors.json');
    fs.writeFileSync(semanticColorsPath, JSON.stringify({ colors: semanticColorsTokens }, null, 2));
    
    // 3. Tipografia
    const typographyTokens = convertToDesignTokensStandard(typography);
    const typographyPath = path.join(outputDir, 'typography.json');
    fs.writeFileSync(typographyPath, JSON.stringify({ typography: typographyTokens }, null, 2));
    
    // 4. Espaçamentos
    const spacingTokens = convertToDesignTokensStandard(spacing);
    const spacingPath = path.join(outputDir, 'spacing.json');
    fs.writeFileSync(spacingPath, JSON.stringify({ spacing: spacingTokens }, null, 2));
    
    // 5. Border radius
    const borderRadiusTokens = convertToDesignTokensStandard(borderRadius);
    const borderRadiusPath = path.join(outputDir, 'border-radius.json');
    fs.writeFileSync(borderRadiusPath, JSON.stringify({ borderRadius: borderRadiusTokens }, null, 2));
    
    // 6. Arquivo completo (todos juntos)
    const allTokens = {
      colors: {
        ...baseColorsTokens,
        ...semanticColorsTokens,
      },
      typography: typographyTokens,
      spacing: spacingTokens,
      borderRadius: borderRadiusTokens,
    };
    const allTokensPath = path.join(outputDir, 'all-tokens.json');
    fs.writeFileSync(allTokensPath, JSON.stringify(allTokens, null, 2));
    
    // Contar tokens
    const totalTokens = Object.keys(allTokens).reduce((count, category) => {
      return count + Object.keys(allTokens[category]).length;
    }, 0);
    
    console.log('✅ Tokens gerados:');
    console.log(`  📁 base-colors.json (${Object.keys(baseColorsTokens).length} tokens)`);
    console.log(`  📁 semantic-colors.json (${Object.keys(semanticColorsTokens).length} tokens)`);
    console.log(`  📁 typography.json (${Object.keys(typographyTokens).length} tokens)`);
    console.log(`  📁 spacing.json (${Object.keys(spacingTokens).length} tokens)`);
    console.log(`  📁 border-radius.json (${Object.keys(borderRadiusTokens).length} tokens)`);
    console.log(`  📁 all-tokens.json (${totalTokens} tokens - arquivo completo)`);
    console.log('');
    console.log('🎉 Geração concluída!');
    console.log('');
    console.log('📋 Use os arquivos separados para:');
    console.log('  - Importar apenas as cores que precisa no Figma');
    console.log('  - Manter organização por categoria');
    console.log('  - Facilitar manutenção e atualizações');
    
  } catch (error) {
    console.error('❌ Erro na geração:', error.message);
    process.exit(1);
  }
}

// Executar
generateSeparatedTokens();
