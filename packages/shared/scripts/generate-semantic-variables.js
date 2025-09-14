#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Script para gerar variáveis semânticas específicas
 * Cria tokens como border-primary, border-secondary, etc.
 * Usa valores do figma-compatible-tokens.json
 */

// Carregar tokens do arquivo existente
function loadFigmaTokens() {
  const tokensPath = path.join(__dirname, '../dist/tokens/figma-compatible-tokens.json');
  
  if (!fs.existsSync(tokensPath)) {
    console.error('❌ Arquivo figma-compatible-tokens.json não encontrado!');
    console.log('Execute primeiro: npm run generate:figma-tokens');
    process.exit(1);
  }
  
  const tokensContent = fs.readFileSync(tokensPath, 'utf8');
  return JSON.parse(tokensContent);
}

// Extrair valores dos tokens existentes
function extractTokenValues(tokens) {
  const values = {};
  
  // Função para extrair valor de um token
  function getTokenValue(tokenPath) {
    const parts = tokenPath.split('.');
    let current = tokens;
    
    for (const part of parts) {
      if (current[part]) {
        current = current[part];
      } else {
        return null;
      }
    }
    
    return current.$value;
  }
  
  // Mapear tokens para variáveis semânticas
  return {
    // Light Theme - usando valores dos tokens existentes
    light: {
      background: {
        primary: getTokenValue('colors.neutral.0') || '#ffffff',
        secondary: getTokenValue('colors.neutral.50') || '#f9fafb',
        tertiary: getTokenValue('colors.neutral.100') || '#f3f4f6',
      },
      surface: {
        primary: getTokenValue('colors.neutral.0') || '#ffffff',
        secondary: getTokenValue('colors.neutral.50') || '#f9fafb',
        tertiary: getTokenValue('colors.neutral.100') || '#f3f4f6',
        elevated: getTokenValue('colors.neutral.0') || '#ffffff',
      },
      text: {
        primary: getTokenValue('colors.neutral.900') || '#111827',
        secondary: getTokenValue('colors.neutral.500') || '#6b7280',
        tertiary: getTokenValue('colors.neutral.400') || '#9ca3af',
        inverse: getTokenValue('colors.neutral.0') || '#ffffff',
        disabled: getTokenValue('colors.neutral.300') || '#d1d5db',
      },
      border: {
        primary: getTokenValue('colors.neutral.200') || '#e5e7eb',
        secondary: getTokenValue('colors.neutral.300') || '#d1d5db',
        focus: getTokenValue('colors.primary.500') || '#3b82f6',
        error: getTokenValue('colors.semantic.error.500') || '#ef4444',
      },
      brand: {
        primary: getTokenValue('colors.primary.500') || '#0ea5e9',
        secondary: getTokenValue('colors.secondary.500') || '#a855f7',
      },
      semantic: {
        success: getTokenValue('colors.semantic.success.500') || '#22c55e',
        warning: getTokenValue('colors.semantic.warning.500') || '#f59e0b',
        error: getTokenValue('colors.semantic.error.500') || '#ef4444',
        info: getTokenValue('colors.semantic.info.500') || '#3b82f6',
      },
    },
    
    // Dark Theme - usando valores dos tokens existentes
    dark: {
      background: {
        primary: getTokenValue('colors.neutral.900') || '#111827',
        secondary: getTokenValue('colors.neutral.800') || '#1f2937',
        tertiary: getTokenValue('colors.neutral.700') || '#374151',
      },
      surface: {
        primary: getTokenValue('colors.neutral.800') || '#1f2937',
        secondary: getTokenValue('colors.neutral.700') || '#374151',
        tertiary: getTokenValue('colors.neutral.600') || '#4b5563',
        elevated: getTokenValue('colors.neutral.700') || '#374151',
      },
      text: {
        primary: getTokenValue('colors.neutral.100') || '#f9fafb',
        secondary: getTokenValue('colors.neutral.300') || '#d1d5db',
        tertiary: getTokenValue('colors.neutral.400') || '#9ca3af',
        inverse: getTokenValue('colors.neutral.900') || '#111827',
        disabled: getTokenValue('colors.neutral.500') || '#6b7280',
      },
      border: {
        primary: getTokenValue('colors.neutral.600') || '#4b5563',
        secondary: getTokenValue('colors.neutral.500') || '#6b7280',
        focus: getTokenValue('colors.primary.400') || '#60a5fa',
        error: getTokenValue('colors.semantic.error.400') || '#f87171',
      },
      brand: {
        primary: getTokenValue('colors.primary.400') || '#38bdf8',
        secondary: getTokenValue('colors.secondary.400') || '#c084fc',
      },
      semantic: {
        success: getTokenValue('colors.semantic.success.400') || '#4ade80',
        warning: getTokenValue('colors.semantic.warning.400') || '#fbbf24',
        error: getTokenValue('colors.semantic.error.400') || '#f87171',
        info: getTokenValue('colors.semantic.info.400') || '#60a5fa',
      },
    },
  };
}

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
        $type: 'color',
        $value: value,
        $description: `Token semântico ${tokenKey} do sistema Jarvi`,
      };
    }
  }
  
  return result;
}

/**
 * Gera arquivo de variáveis semânticas
 */
function generateSemanticVariables() {
  console.log('🎨 Gerando variáveis semânticas...');
  
  try {
    // Carregar tokens do arquivo existente
    console.log('📖 Carregando tokens do figma-compatible-tokens.json...');
    const figmaTokens = loadFigmaTokens();
    
    // Extrair valores dos tokens existentes
    const semanticVariables = extractTokenValues(figmaTokens);
    
    // Garantir que o diretório existe
    const outputDir = path.join(__dirname, '../dist/tokens');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Converter variáveis semânticas
    const semanticTokens = {
      light: convertToDesignTokensStandard(semanticVariables.light, 'light'),
      dark: convertToDesignTokensStandard(semanticVariables.dark, 'dark'),
    };
    
    // Salvar arquivo
    const outputPath = path.join(outputDir, 'semantic-variables.json');
    fs.writeFileSync(outputPath, JSON.stringify(semanticTokens, null, 2));
    
    // Contar tokens
    const totalTokens = Object.keys(semanticTokens.light).length + Object.keys(semanticTokens.dark).length;
    
    console.log(`✅ Variáveis semânticas geradas: ${outputPath}`);
    console.log(`📊 Total de tokens: ${totalTokens}`);
    console.log('🎉 Geração concluída!');
    console.log('');
    console.log('📋 Variáveis incluídas:');
    console.log('  🌞 Light Theme:');
    console.log('    - background.primary, secondary, tertiary');
    console.log('    - surface.primary, secondary, tertiary, elevated');
    console.log('    - text.primary, secondary, tertiary, inverse, disabled');
    console.log('    - border.primary, secondary, focus, error');
    console.log('    - brand.primary, secondary');
    console.log('    - semantic.success, warning, error, info');
    console.log('  🌙 Dark Theme:');
    console.log('    - background.primary, secondary, tertiary');
    console.log('    - surface.primary, secondary, tertiary, elevated');
    console.log('    - text.primary, secondary, tertiary, inverse, disabled');
    console.log('    - border.primary, secondary, focus, error');
    console.log('    - brand.primary, secondary');
    console.log('    - semantic.success, warning, error, info');
    console.log('');
    console.log('🚀 Use este arquivo no Figma para variáveis semânticas específicas!');
    
  } catch (error) {
    console.error('❌ Erro na geração:', error.message);
    process.exit(1);
  }
}

// Executar
generateSemanticVariables();
