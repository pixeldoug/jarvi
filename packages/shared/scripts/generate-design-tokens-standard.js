#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Importar tokens do design system
const { designTokens } = require('../dist/design-system/tokens');

/**
 * Converte cor hex para formato padrão Design Tokens
 */
function hexToStandardColor(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  
  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;
  
  return {
    colorSpace: "srgb",
    components: [r, g, b]
  };
}

/**
 * Gera tokens no formato padrão Design Tokens
 */
function generateDesignTokensStandard() {
  const tokens = {
    // Cores agrupadas
    "colors": {
      "primary": {},
      "secondary": {},
      "neutral": {},
      "semantic": {}
    },
    
    // Tipografia agrupada
    "typography": {
      "fontFamily": {},
      "fontSize": {},
      "fontWeight": {},
      "lineHeight": {},
      "letterSpacing": {}
    },
    
    // Espaçamentos (apenas valores semânticos)
    "spacing": {},
    
    // Efeitos agrupados
    "effects": {
      "borderRadius": {},
      "boxShadow": {}
    },
    
    // Animações
    "animation": {
      "duration": {},
      "timingFunction": {}
    },
    
    // Z-Index
    "zIndex": {}
  };

  // Cores primárias
  Object.entries(designTokens.colors.primary).forEach(([scale, value]) => {
    tokens.colors.primary[scale] = {
      $type: "color",
      $value: value, // Usar valor hex diretamente
      $description: `Cor primária ${scale} do sistema Jarvi`
    };
  });

  // Cores secundárias
  Object.entries(designTokens.colors.secondary).forEach(([scale, value]) => {
    tokens.colors.secondary[scale] = {
      $type: "color",
      $value: value, // Usar valor hex diretamente
      $description: `Cor secundária ${scale} do sistema Jarvi`
    };
  });

  // Cores neutras
  Object.entries(designTokens.colors.neutral).forEach(([scale, value]) => {
    tokens.colors.neutral[scale] = {
      $type: "color",
      $value: value, // Usar valor hex diretamente
      $description: `Cor neutra ${scale} do sistema Jarvi`
    };
  });

  // Cores semânticas
  Object.entries(designTokens.colors.semantic).forEach(([semantic, scales]) => {
    tokens.colors.semantic[semantic] = {};
    Object.entries(scales).forEach(([scale, value]) => {
      tokens.colors.semantic[semantic][scale] = {
        $type: "color",
        $value: value, // Usar valor hex diretamente
        $description: `Cor semântica ${semantic} ${scale} do sistema Jarvi`
      };
    });
  });

  // Font Family
  Object.entries(designTokens.typography.fontFamily).forEach(([family, fonts]) => {
    tokens.typography.fontFamily[family] = {
      $type: "string",
      $value: fonts.join(', '), // Converter array para string separada por vírgula
      $description: `Família de fonte ${family} do sistema Jarvi`
    };
  });

  // Font Size
  Object.entries(designTokens.typography.fontSize).forEach(([size, config]) => {
    const fontSize = Array.isArray(config) ? config[0] : config;
    const fontSizeValue = typeof fontSize === 'string' ? fontSize : fontSize.fontSize;
    
    // Converter para formato padrão (rem para px)
    const pxValue = parseFloat(fontSizeValue.replace('rem', '')) * 16;
    
    tokens.typography.fontSize[size] = {
      $type: "dimension",
      $value: `${pxValue}px`,
      $description: `Tamanho de fonte ${size} do sistema Jarvi`
    };
  });

  // Font Weight (convertido para number, pois fontWeight não é suportado)
  Object.entries(designTokens.typography.fontWeight).forEach(([weight, value]) => {
    tokens.typography.fontWeight[weight] = {
      $type: "number",
      $value: parseInt(value),
      $description: `Peso da fonte ${weight} do sistema Jarvi`
    };
  });

  // Line Height
  Object.entries(designTokens.typography.lineHeight).forEach(([height, value]) => {
    tokens.typography.lineHeight[height] = {
      $type: "number",
      $value: parseFloat(value),
      $description: `Altura da linha ${height} do sistema Jarvi`
    };
  });

  // Letter Spacing
  Object.entries(designTokens.typography.letterSpacing).forEach(([spacing, value]) => {
    tokens.typography.letterSpacing[spacing] = {
      $type: "dimension",
      $value: value,
      $description: `Espaçamento entre letras ${spacing} do sistema Jarvi`
    };
  });

  // Spacing - Apenas valores semânticos principais
  const semanticSpacing = ['none', 'px', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl'];
  
  Object.entries(designTokens.spacing).forEach(([key, value]) => {
    if (semanticSpacing.includes(key)) {
      const pxValue = parseFloat(value.replace('rem', '')) * 16;
      
      tokens.spacing[key] = {
        $type: "dimension",
        $value: `${pxValue}px`,
        $description: `Espaçamento ${key} do sistema Jarvi`
      };
    }
    // Ignorar todos os valores extended (0.5, 1.5, 2.5, ..., 96.5)
  });

  // Border Radius
  Object.entries(designTokens.borderRadius).forEach(([key, value]) => {
    const pxValue = parseFloat(value.replace('rem', '')) * 16;
    
    tokens.effects.borderRadius[key] = {
      $type: "dimension",
      $value: `${pxValue}px`,
      $description: `Raio da borda ${key} do sistema Jarvi`
    };
  });

  // Box Shadow (simplificado para o formato padrão)
  Object.entries(designTokens.boxShadow).forEach(([key, value]) => {
    tokens.effects.boxShadow[key] = {
      $type: "string",
      $value: value, // Usar valor string diretamente
      $description: `Sombra ${key} do sistema Jarvi`
    };
  });

  // Animation Duration
  Object.entries(designTokens.animation.duration).forEach(([duration, value]) => {
    tokens.animation.duration[duration] = {
      $type: "dimension",
      $value: value,
      $description: `Duração de animação ${duration} do sistema Jarvi`
    };
  });

  // Animation Timing Function
  Object.entries(designTokens.animation.timingFunction).forEach(([timing, value]) => {
    tokens.animation.timingFunction[timing] = {
      $type: "string",
      $value: value,
      $description: `Função de timing ${timing} do sistema Jarvi`
    };
  });

  // Animation Keyframes - Removido pois não é compatível com Design Tokens Manager

  // Z-Index
  Object.entries(designTokens.zIndex).forEach(([index, value]) => {
    if (value === 'auto') {
      // Pular valores 'auto' pois não são compatíveis com o plugin
      return;
    }
    
    tokens.zIndex[index] = {
      $type: "number",
      $value: parseInt(value),
      $description: `Z-index ${index} do sistema Jarvi`
    };
  });

  return tokens;
}

/**
 * Gera arquivo no formato padrão Design Tokens
 */
function generateDesignTokensStandardFile() {
  console.log('🎨 Gerando tokens no formato padrão Design Tokens...');
  
  const tokens = generateDesignTokensStandard();
  const outputPath = path.join(__dirname, '../dist/tokens/design-tokens-standard.json');
  
  // Criar diretório se não existir
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Escrever arquivo
  fs.writeFileSync(outputPath, JSON.stringify(tokens, null, 2));
  
  console.log(`✅ Tokens no formato padrão gerados: ${outputPath}`);
  
  // Estatísticas
  const totalTokens = Object.keys(tokens).length;
  const colorTokens = Object.keys(tokens).filter(key => tokens[key].$type === 'color').length;
  const dimensionTokens = Object.keys(tokens).filter(key => tokens[key].$type === 'dimension').length;
  
  console.log(`📊 Total de tokens: ${totalTokens}`);
  console.log(`🎨 Cores: ${colorTokens}`);
  console.log(`📏 Dimensões: ${dimensionTokens}`);
  
  return outputPath;
}

// Executar
if (require.main === module) {
  try {
    generateDesignTokensStandardFile();
    console.log('🎉 Geração concluída!');
  } catch (error) {
    console.error('❌ Erro na geração:', error.message);
    process.exit(1);
  }
}

module.exports = { generateDesignTokensStandard, generateDesignTokensStandardFile };
