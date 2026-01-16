/**
 * Import from Figma
 * 
 * This script parses the Figma Tokens Plugin JSON files and generates
 * platform-agnostic TypeScript token files in the core/ directory
 */

const fs = require('fs');
const path = require('path');

const FIGMA_DIR = path.join(__dirname, '../figma');
const CORE_DIR = path.join(__dirname, '../core');

// Helper to convert RGB components to hex
function rgbToHex(r, g, b) {
  const toHex = (val) => {
    const hex = Math.round(val * 255).toString(16).padStart(2, '0');
    return hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

// Helper to extract color value from token
function extractColorValue(token) {
  if (typeof token.$value === 'string') {
    // If it's a reference like "{Semantic.content.content-primary}", keep it as is for now
    if (token.$value.startsWith('{')) {
      return token.$value;
    }
    return token.$value;
  }
  
  if (token.$value && token.$value.hex) {
    return token.$value.hex;
  }
  
  if (token.$value && token.$value.components) {
    const [r, g, b] = token.$value.components;
    const alpha = token.$value.alpha || 1;
    
    if (alpha < 1) {
      // Return rgba
      return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`;
    }
    
    return rgbToHex(r, g, b);
  }
  
  return '#000000'; // Fallback
}

// Parse primitives (Default.tokens.json)
function parsePrimitives() {
  const defaultTokensPath = path.join(FIGMA_DIR, 'Default.tokens.json');
  const data = JSON.parse(fs.readFileSync(defaultTokensPath, 'utf-8'));
  
  // Parse Colors
  const colors = {};
  if (data.Colors) {
    Object.entries(data.Colors).forEach(([category, shades]) => {
      const categoryKey = category.toLowerCase().replace(/[^a-z0-9]/g, '');
      colors[categoryKey] = {};
      
      Object.entries(shades).forEach(([shade, token]) => {
        const shadeKey = shade.replace(/[^a-z0-9]/g, '');
        colors[categoryKey][shadeKey] = extractColorValue(token);
      });
    });
  }
  
  // Parse Typography
  const typography = {
    fontFamily: {},
    fontSize: {},
    fontWeight: {},
    fontStyle: {},
    letterSpacing: {},
  };
  
  if (data.Typography) {
    if (data.Typography.fontFamily) {
      Object.entries(data.Typography.fontFamily).forEach(([key, token]) => {
        typography.fontFamily[key] = token.$value;
      });
    }
    
    if (data.Typography.fontWeight) {
      Object.entries(data.Typography.fontWeight).forEach(([key, token]) => {
        typography.fontWeight[key] = token.$value;
      });
    }
    
    if (data.Typography.fontStyle) {
      Object.entries(data.Typography.fontStyle).forEach(([key, token]) => {
        typography.fontStyle[key] = token.$value;
      });
    }
    
    if (data.Typography.letterSpacing) {
      Object.entries(data.Typography.letterSpacing).forEach(([key, token]) => {
        typography.letterSpacing[key] = token.$value;
      });
    }
  }
  
  // Parse Sizes (spacing)
  const sizes = {};
  if (data.Sizes) {
    Object.entries(data.Sizes).forEach(([key, token]) => {
      if (typeof token === 'object' && '$value' in token) {
        const cleanKey = key.replace(/[^a-z0-9]/g, '');
        sizes[cleanKey] = token.$value;
      }
    });
  }
  
  // Parse Opacity
  const opacity = {};
  if (data.Opacity) {
    Object.entries(data.Opacity).forEach(([key, token]) => {
      const cleanKey = key.replace(/[^a-z0-9]/g, '');
      opacity[cleanKey] = token.$value / 100; // Convert to 0-1 scale
    });
  }
  
  return { colors, typography, sizes, opacity };
}

// Parse semantic tokens (Light and Dark)
function parseSemanticTokens() {
  const lightPath = path.join(FIGMA_DIR, 'Light.tokens.json');
  const darkPath = path.join(FIGMA_DIR, 'Dark.tokens.json');
  
  const lightData = JSON.parse(fs.readFileSync(lightPath, 'utf-8'));
  const darkData = JSON.parse(fs.readFileSync(darkPath, 'utf-8'));
  
  const lightSemantic = {};
  const darkSemantic = {};
  const components = { light: {}, dark: {} };
  
  // Parse semantic tokens
  if (lightData.Semantic) {
    Object.entries(lightData.Semantic).forEach(([category, tokens]) => {
      lightSemantic[category] = {};
      Object.entries(tokens).forEach(([key, token]) => {
        lightSemantic[category][key] = extractColorValue(token);
      });
    });
  }
  
  if (darkData.Semantic) {
    Object.entries(darkData.Semantic).forEach(([category, tokens]) => {
      darkSemantic[category] = {};
      Object.entries(tokens).forEach(([key, token]) => {
        darkSemantic[category][key] = extractColorValue(token);
      });
    });
  }
  
  // Parse component tokens
  if (lightData.Components) {
    components.light = parseComponentTokens(lightData.Components);
  }
  
  if (darkData.Components) {
    components.dark = parseComponentTokens(darkData.Components);
  }
  
  return { lightSemantic, darkSemantic, components };
}

function parseComponentTokens(componentsObj) {
  const result = {};
  
  function traverse(obj, path = []) {
    const current = {};
    
    Object.entries(obj).forEach(([key, value]) => {
      if (value && typeof value === 'object' && '$value' in value) {
        // This is a token
        current[key] = extractColorValue(value);
      } else if (value && typeof value === 'object') {
        // This is a nested object
        current[key] = traverse(value, [...path, key]);
      }
    });
    
    return current;
  }
  
  Object.entries(componentsObj).forEach(([component, tokens]) => {
    result[component] = traverse(tokens);
  });
  
  return result;
}

// Generate TypeScript files
function generateColorsFile(colors) {
  const content = `/**
 * Color Tokens
 * Generated from Figma
 * DO NOT EDIT MANUALLY
 */

export const colors = ${JSON.stringify(colors, null, 2)} as const;

export type ColorCategory = keyof typeof colors;
export type ColorShade<T extends ColorCategory> = keyof typeof colors[T];
`;
  
  fs.writeFileSync(path.join(CORE_DIR, 'colors.ts'), content);
  console.log('✓ Generated colors.ts');
}

function generateTypographyFile(typography) {
  const content = `/**
 * Typography Tokens
 * Generated from Figma
 * DO NOT EDIT MANUALLY
 */

export const typography = ${JSON.stringify(typography, null, 2)} as const;

export type FontFamily = keyof typeof typography.fontFamily;
export type FontWeight = keyof typeof typography.fontWeight;
export type FontStyle = keyof typeof typography.fontStyle;
export type LetterSpacing = keyof typeof typography.letterSpacing;
`;
  
  fs.writeFileSync(path.join(CORE_DIR, 'typography.ts'), content);
  console.log('✓ Generated typography.ts');
}

function generateSpacingFile(sizes, opacity) {
  const content = `/**
 * Spacing & Size Tokens
 * Generated from Figma
 * DO NOT EDIT MANUALLY
 */

export const spacing = ${JSON.stringify(sizes, null, 2)} as const;

export const opacity = ${JSON.stringify(opacity, null, 2)} as const;

export type SpacingKey = keyof typeof spacing;
export type OpacityKey = keyof typeof opacity;
`;
  
  fs.writeFileSync(path.join(CORE_DIR, 'spacing.ts'), content);
  console.log('✓ Generated spacing.ts');
}

function generateSemanticFile(lightSemantic, darkSemantic, components) {
  const content = `/**
 * Semantic Tokens
 * Generated from Figma
 * DO NOT EDIT MANUALLY
 */

export const semanticTokens = {
  light: ${JSON.stringify(lightSemantic, null, 2)},
  dark: ${JSON.stringify(darkSemantic, null, 2)},
} as const;

export const componentTokens = {
  light: ${JSON.stringify(components.light, null, 2)},
  dark: ${JSON.stringify(components.dark, null, 2)},
} as const;

export type ThemeMode = 'light' | 'dark';
export type SemanticCategory = keyof typeof semanticTokens.light;
`;
  
  fs.writeFileSync(path.join(CORE_DIR, 'semantic.ts'), content);
  console.log('✓ Generated semantic.ts');
}

// Main execution
async function main() {
  console.log('🎨 Importing tokens from Figma...\n');
  
  // Ensure core directory exists
  if (!fs.existsSync(CORE_DIR)) {
    fs.mkdirSync(CORE_DIR, { recursive: true });
  }
  
  try {
    // Parse primitives
    const { colors, typography, sizes, opacity } = parsePrimitives();
    
    // Parse semantic tokens
    const { lightSemantic, darkSemantic, components } = parseSemanticTokens();
    
    // Generate TypeScript files
    generateColorsFile(colors);
    generateTypographyFile(typography);
    generateSpacingFile(sizes, opacity);
    generateSemanticFile(lightSemantic, darkSemantic, components);
    
    console.log('\n✅ Successfully imported tokens from Figma!');
    console.log('📁 Generated files in:', CORE_DIR);
  } catch (error) {
    console.error('❌ Error importing tokens:', error);
    process.exit(1);
  }
}

main();























