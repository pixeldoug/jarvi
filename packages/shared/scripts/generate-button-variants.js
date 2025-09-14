/**
 * Script para gerar variantes do Button para o Figma
 * Cria todas as combinações de variantes, tamanhos e estados
 */

const fs = require('fs');
const path = require('path');

// Carregar tokens do Figma
const figmaTokensPath = path.join(__dirname, '../dist/tokens/figma-compatible-tokens.json');
const figmaTokens = JSON.parse(fs.readFileSync(figmaTokensPath, 'utf8'));

// Função para obter valor do token
function getTokenValue(tokenPath) {
  const parts = tokenPath.split('.');
  let value = figmaTokens;
  
  for (const part of parts) {
    if (value && value[part]) {
      value = value[part];
    } else {
      return null;
    }
  }
  
  return value?.$value || value;
}

// Configurações do Button
const buttonConfig = {
  variants: ['Primary', 'Secondary', 'Outline', 'Ghost', 'Danger'],
  sizes: ['Small', 'Medium', 'Large'],
  states: ['Default', 'Hover', 'Active', 'Focus', 'Disabled', 'Loading'],
  themes: ['Light', 'Dark'],
  iconPositions: ['Text Only', 'Left Icon', 'Right Icon', 'Icon Only']
};

// Mapeamento de cores por variante
const variantColors = {
  Primary: {
    light: {
      background: 'colors.primary.500',
      border: 'colors.primary.500',
      text: 'colors.white',
      hover: 'colors.primary.600'
    },
    dark: {
      background: 'colors.primary.400',
      border: 'colors.primary.400', 
      text: 'colors.white',
      hover: 'colors.primary.300'
    }
  },
  Secondary: {
    light: {
      background: 'colors.secondary.500',
      border: 'colors.secondary.500',
      text: 'colors.white',
      hover: 'colors.secondary.600'
    },
    dark: {
      background: 'colors.secondary.400',
      border: 'colors.secondary.400',
      text: 'colors.white', 
      hover: 'colors.secondary.300'
    }
  },
  Outline: {
    light: {
      background: 'transparent',
      border: 'colors.neutral.300',
      text: 'colors.neutral.700',
      hover: 'colors.neutral.50'
    },
    dark: {
      background: 'transparent',
      border: 'colors.neutral.600',
      text: 'colors.neutral.100',
      hover: 'colors.neutral.700'
    }
  },
  Ghost: {
    light: {
      background: 'transparent',
      border: 'transparent',
      text: 'colors.neutral.700',
      hover: 'colors.neutral.50'
    },
    dark: {
      background: 'transparent',
      border: 'transparent',
      text: 'colors.neutral.100',
      hover: 'colors.neutral.700'
    }
  },
  Danger: {
    light: {
      background: 'colors.error.500',
      border: 'colors.error.500',
      text: 'colors.white',
      hover: 'colors.error.600'
    },
    dark: {
      background: 'colors.error.600',
      border: 'colors.error.600',
      text: 'colors.white',
      hover: 'colors.error.700'
    }
  }
};

// Configurações de tamanho (usando números do spacing.ts)
const sizeConfig = {
  Small: {
    padding: { horizontal: 'spacing.2', vertical: 'spacing.1' },
    fontSize: 'typography.fontSize.sm',
    height: '32px',
    minWidth: '80px'
  },
  Medium: {
    padding: { horizontal: 'spacing.3', vertical: 'spacing.2' },
    fontSize: 'typography.fontSize.base',
    height: '40px',
    minWidth: '100px'
  },
  Large: {
    padding: { horizontal: 'spacing.4', vertical: 'spacing.3' },
    fontSize: 'typography.fontSize.lg',
    height: '48px',
    minWidth: '120px'
  }
};

// Gerar variantes do Button
function generateButtonVariants() {
  const variants = [];
  
  buttonConfig.variants.forEach(variant => {
    buttonConfig.sizes.forEach(size => {
      buttonConfig.states.forEach(state => {
        buttonConfig.themes.forEach(theme => {
          buttonConfig.iconPositions.forEach(iconPosition => {
            const variantKey = `${variant}/${size}/${state}/${theme}/${iconPosition}`;
            const colors = variantColors[variant][theme.toLowerCase()];
            const sizeProps = sizeConfig[size];
          
          // Determinar propriedades baseadas no estado
          let opacity = '100%';
          let transform = 'none';
          let boxShadow = 'none';
          
          if (state === 'Hover') {
            transform = 'translateY(-1px)';
            boxShadow = 'shadow.md';
          } else if (state === 'Active') {
            transform = 'translateY(0px)';
            boxShadow = 'shadow.sm';
          } else if (state === 'Disabled' || state === 'Loading') {
            opacity = '50%';
          }
          
          // Configurações específicas para icon-only
          const isIconOnly = iconPosition === 'Icon Only';
          const iconSize = size === 'Small' ? 16 : size === 'Medium' ? 20 : 24;
          const iconSpacing = size === 'Small' ? 'spacing.1' : size === 'Medium' ? 'spacing.2' : 'spacing.3';
          
          const variantData = {
            name: variantKey,
            description: `Button ${variant} ${size} ${state} ${theme} ${iconPosition}`,
            properties: {
              variant: variant,
              size: size,
              state: state,
              theme: theme,
              iconPosition: iconPosition,
              colors: {
                background: getTokenValue(colors.background) || colors.background,
                border: getTokenValue(colors.border) || colors.border,
                text: getTokenValue(colors.text) || colors.text,
                hover: getTokenValue(colors.hover) || colors.hover
              },
              layout: {
                padding: isIconOnly ? {
                  all: getTokenValue(sizeProps.padding.horizontal) || sizeProps.padding.horizontal
                } : {
                  horizontal: getTokenValue(sizeProps.padding.horizontal) || sizeProps.padding.horizontal,
                  vertical: getTokenValue(sizeProps.padding.vertical) || sizeProps.padding.vertical
                },
                fontSize: getTokenValue(sizeProps.fontSize) || sizeProps.fontSize,
                height: sizeProps.height,
                minWidth: isIconOnly ? sizeProps.height : sizeProps.minWidth, // Quadrado para icon-only
                borderRadius: getTokenValue('borderRadius.lg') || '8px',
                borderWidth: '1px',
                borderStyle: 'solid'
              },
              icon: {
                size: iconSize,
                spacing: iconSpacing,
                position: iconPosition
              },
              states: {
                opacity: opacity,
                transform: transform,
                boxShadow: boxShadow
              }
            }
          };
          
          variants.push(variantData);
          });
        });
      });
    });
  });
  
  return variants;
}

// Gerar arquivo final
function generateButtonFile() {
  console.log('🎨 Gerando variantes do Button para Figma...');
  
  const variants = generateButtonVariants();
  
  const buttonFile = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    name: 'Button Variants - Jarvi Design System',
    description: 'Todas as variantes do componente Button para uso no Figma',
    version: '1.0.0',
    component: 'Button',
    totalVariants: variants.length,
    variants: variants,
    usage: {
      figma: {
        componentName: 'Button',
        variantProperties: [
          'Variant (Primary/Secondary/Outline/Ghost/Danger)',
          'Size (Small/Medium/Large)',
          'State (Default/Hover/Active/Focus/Disabled/Loading)',
          'Theme (Light/Dark)',
          'Icon Position (Text Only/Left Icon/Right Icon/Icon Only)'
        ],
        autoLayout: {
          direction: 'horizontal',
          spacing: '8px',
          padding: 'varies by size',
          fill: 'varies by variant and theme',
          stroke: 'varies by variant and theme'
        }
      },
      guidelines: [
        'Use Primary para ações principais',
        'Use Secondary para ações secundárias', 
        'Use Outline para ações alternativas',
        'Use Ghost para ações sutis',
        'Use Danger para ações destrutivas',
        'Mantenha consistência de tamanhos',
        'Teste em ambos os temas'
      ]
    }
  };
  
  const outputPath = path.join(__dirname, '../dist/tokens/button-variants.json');
  fs.writeFileSync(outputPath, JSON.stringify(buttonFile, null, 2));
  
  console.log(`✅ Variantes do Button geradas: ${outputPath}`);
  console.log(`📊 Total de variantes: ${variants.length}`);
  console.log('🎉 Geração concluída!');
  
  console.log('\n📋 Variantes incluídas:');
  buttonConfig.variants.forEach(variant => {
    const totalCombinations = buttonConfig.sizes.length * buttonConfig.states.length * buttonConfig.themes.length * buttonConfig.iconPositions.length;
    console.log(`  - ${variant}: ${totalCombinations} combinações`);
  });
  
  console.log('\n🎯 Posições de ícone:');
  buttonConfig.iconPositions.forEach(position => {
    console.log(`  - ${position}`);
  });
  
  console.log('\n🚀 Use este arquivo no Figma para criar o componente Button!');
}

// Executar
generateButtonFile();
