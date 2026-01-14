/**
 * Import from Figma
 * 
 * This script parses the Figma Tokens Plugin JSON files and generates
 * platform-agnostic TypeScript token files in the core/ directory
 */

const fs = require('fs');
const path = require('path');

const FIGMA_DIR = path.join(__dirname, '../tokens/figma');
const CORE_DIR = path.join(__dirname, '../tokens/core');

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
  
  // Check components first to handle alpha/transparency correctly
  if (token.$value && token.$value.components) {
    const [r, g, b] = token.$value.components;
    const alpha = token.$value.alpha;
    
    // If alpha is defined and less than 1, return rgba with transparency
    if (alpha !== undefined && alpha < 1) {
      // Round alpha to reasonable precision (avoid floating point noise)
      const roundedAlpha = Math.round(alpha * 100) / 100;
      return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${roundedAlpha})`;
    }
    
    // No transparency, use hex if available, otherwise convert from components
    if (token.$value.hex) {
      return token.$value.hex;
    }
    return rgbToHex(r, g, b);
  }
  
  // Fallback to hex if no components
  if (token.$value && token.$value.hex) {
    return token.$value.hex;
  }
  
  return '#000000'; // Fallback
}

// Helper to check if an object is a token (has $value) or a nested category
function isToken(obj) {
  return obj && typeof obj === 'object' && '$value' in obj;
}

// Helper to recursively parse color tokens (supports 2 or 3 levels of nesting)
function parseColorCategory(obj) {
  const result = {};
  
  Object.entries(obj).forEach(([key, value]) => {
    const cleanKey = key.toLowerCase().replace(/[^a-z0-9-]/g, '');
    
    if (isToken(value)) {
      // This is a token, extract the color value
      result[cleanKey] = extractColorValue(value);
    } else if (value && typeof value === 'object') {
      // This is a nested category (e.g., brand.primary), recurse
      result[cleanKey] = parseColorCategory(value);
    }
  });
  
  return result;
}

// Parse primitives (Default.tokens.json)
function parsePrimitives() {
  const defaultTokensPath = path.join(FIGMA_DIR, 'Default.tokens.json');
  const data = JSON.parse(fs.readFileSync(defaultTokensPath, 'utf-8'));
  
  // Parse Colors (supports nested structure like brand.primary.50)
  const colors = {};
  if (data.Colors) {
    Object.entries(data.Colors).forEach(([category, content]) => {
      const categoryKey = category.toLowerCase().replace(/[^a-z0-9]/g, '');
      colors[categoryKey] = parseColorCategory(content);
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
  
  // Helper to recursively parse semantic tokens (supports nested structures like gradient.primary.stop-0)
  function parseSemanticCategory(obj) {
    const result = {};
    
    Object.entries(obj).forEach(([key, value]) => {
      if (value && typeof value === 'object' && '$value' in value) {
        // This is a token, extract the color value
        result[key] = extractColorValue(value);
      } else if (value && typeof value === 'object') {
        // This is a nested category (e.g., gradient.primary), recurse
        result[key] = parseSemanticCategory(value);
      }
    });
    
    return result;
  }
  
  // Parse semantic tokens with nested structure support
  if (lightData.Semantic) {
    Object.entries(lightData.Semantic).forEach(([category, tokens]) => {
      lightSemantic[category] = parseSemanticCategory(tokens);
    });
  }
  
  if (darkData.Semantic) {
    Object.entries(darkData.Semantic).forEach(([category, tokens]) => {
      darkSemantic[category] = parseSemanticCategory(tokens);
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

function generateSizesFile(sizes, opacity) {
  const content = `/**
 * Sizes & Opacity Tokens
 * Generated from Figma
 * DO NOT EDIT MANUALLY
 */

export const sizes = ${JSON.stringify(sizes, null, 2)} as const;

export const opacity = ${JSON.stringify(opacity, null, 2)} as const;

export type SizesKey = keyof typeof sizes;
export type OpacityKey = keyof typeof opacity;
`;
  
  fs.writeFileSync(path.join(CORE_DIR, 'sizes.ts'), content);
  console.log('✓ Generated sizes.ts');
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
// Parse Mode tokens (sizing system built upon primitives)
function parseModeTokens() {
  const modeFile = path.join(FIGMA_DIR, 'Mode.tokens.json');
  
  if (!fs.existsSync(modeFile)) {
    console.log('⚠️  Mode.tokens.json not found, skipping...');
    return { typography: {}, sizing: {} };
  }
  
  console.log('📦 Parsing Mode.tokens.json...');
  const data = JSON.parse(fs.readFileSync(modeFile, 'utf8'));
  
  const sizing = {
    typography: {},
    spacing: {},
    dimensions: {},
    radius: {},
    chip: {},
    target: {},
  };
  
  // Parse typography sizing
  if (data.typography) {
    Object.entries(data.typography).forEach(([key, value]) => {
      // Mantém kebab-case original do Figma
      const sizeKey = key;
      sizing.typography[sizeKey] = {
        fontSize: value['font-size']?.$value || 16,
        lineHeight: value['line-height']?.$value || 24,
        fontWeight: value['font-weight']?.$value || 400,
        letterSpacing: value['letter-spacing']?.$value || 0,
      };
    });
  }
  
  // Parse radius tokens
  if (data.radius) {
    function parseRadiusTokens(obj, prefix = '') {
      Object.entries(obj).forEach(([key, value]) => {
        if (value && typeof value === 'object' && '$value' in value) {
          // This is a token - mantém kebab-case
          const tokenKey = prefix ? `${prefix}-${key}` : key;
          // Handle both direct values and references
          let tokenValue = value.$value;
          if (typeof tokenValue === 'string' && tokenValue.startsWith('{')) {
            // Keep reference as string for now, will be resolved in generate script
            tokenValue = tokenValue;
          }
          sizing.radius[tokenKey] = tokenValue;
        } else if (value && typeof value === 'object') {
          // Nested object (like button.button-radius)
          const newPrefix = prefix ? `${prefix}-${key}` : key;
          parseRadiusTokens(value, newPrefix);
        }
      });
    }
    
    parseRadiusTokens(data.radius);
  }
  
  // Parse other sizing tokens if they exist
  if (data.spacing) {
    Object.entries(data.spacing).forEach(([key, token]) => {
      sizing.spacing[key] = token.$value;
    });
  }
  
  if (data.dimensions) {
    Object.entries(data.dimensions).forEach(([key, token]) => {
      sizing.dimensions[key] = token.$value;
    });
  }
  
  // Parse chip size tokens
  if (data.size && data.size.chip) {
    function parseChipSizeTokens(obj, prefix = '') {
      Object.entries(obj).forEach(([key, value]) => {
        if (value && typeof value === 'object' && '$value' in value) {
          // This is a token - mantém kebab-case
          const tokenKey = prefix ? `${prefix}-${key}` : key;
          // Handle both direct values and references
          let tokenValue = value.$value;
          if (typeof tokenValue === 'string' && tokenValue.startsWith('{')) {
            // Keep reference as string for now, will be resolved in generate script
            tokenValue = tokenValue;
          }
          sizing.chip[tokenKey] = tokenValue;
        } else if (value && typeof value === 'object') {
          // Nested object
          const newPrefix = prefix ? `${prefix}-${key}` : key;
          parseChipSizeTokens(value, newPrefix);
        }
      });
    }
    
    parseChipSizeTokens(data.size.chip);
  }
  
  // Parse size.target tokens (fine, tight, etc.)
  if (data.size && data.size.target) {
    function parseTargetSizeTokens(obj, prefix = '') {
      Object.entries(obj).forEach(([key, value]) => {
        if (value && typeof value === 'object' && '$value' in value) {
          // This is a token - mantém kebab-case
          const tokenKey = prefix ? `${prefix}-${key}` : key;
          // Handle both direct values and references
          let tokenValue = value.$value;
          if (typeof tokenValue === 'string' && tokenValue.startsWith('{')) {
            // Keep reference as string for now, will be resolved in generate script
            tokenValue = tokenValue;
          }
          sizing.target[tokenKey] = tokenValue;
        } else if (value && typeof value === 'object') {
          // Nested object
          const newPrefix = prefix ? `${prefix}-${key}` : key;
          parseTargetSizeTokens(value, newPrefix);
        }
      });
    }
    
    parseTargetSizeTokens(data.size.target);
  }
  
  return sizing;
}

// Generate sizing file
function generateSizingFile(sizing) {
  console.log('📝 Generating sizing.ts...');
  
  // Helper function to quote keys if they contain hyphens
  const quoteKeyIfNeeded = (key) => {
    return key.includes('-') ? `'${key}'` : key;
  };
  
  let content = `/**
 * Sizing Tokens - Generated from Figma
 * 
 * Typography and sizing system built upon primitives
 * @generated Do not edit manually
 */

// ============================================================================
// TYPOGRAPHY SIZING
// ============================================================================

export const typographySizing = {
`;
  
  Object.entries(sizing.typography).forEach(([key, value]) => {
    content += `  ${quoteKeyIfNeeded(key)}: {\n`;
    content += `    fontSize: ${value.fontSize},\n`;
    content += `    lineHeight: ${value.lineHeight},\n`;
    content += `    fontWeight: ${value.fontWeight},\n`;
    content += `    letterSpacing: ${value.letterSpacing},\n`;
    content += `  },\n`;
  });
  
  content += `} as const;\n\n`;
  
  // Add spacing if exists
  if (Object.keys(sizing.spacing).length > 0) {
    content += `// ============================================================================
// SPACING SYSTEM
// ============================================================================

export const spacingSystem = {
`;
    Object.entries(sizing.spacing).forEach(([key, value]) => {
      content += `  ${quoteKeyIfNeeded(key)}: ${value},\n`;
    });
    content += `} as const;\n\n`;
  }
  
  // Add dimensions if exists
  if (Object.keys(sizing.dimensions).length > 0) {
    content += `// ============================================================================
// DIMENSIONS
// ============================================================================

export const dimensions = {
`;
    Object.entries(sizing.dimensions).forEach(([key, value]) => {
      content += `  ${quoteKeyIfNeeded(key)}: ${value},\n`;
    });
    content += `} as const;\n\n`;
  }
  
  // Add radius if exists
  if (Object.keys(sizing.radius).length > 0) {
    content += `// ============================================================================
// RADIUS
// ============================================================================

export const radius = {
`;
    Object.entries(sizing.radius).forEach(([key, value]) => {
      // Check if value is a reference (string starting with {)
      if (typeof value === 'string' && value.startsWith('{')) {
        // Output reference as-is (will be string in TS)
        content += `  ${quoteKeyIfNeeded(key)}: '${value}',\n`;
      } else {
        // Output number value
        content += `  ${quoteKeyIfNeeded(key)}: ${value},\n`;
      }
    });
    content += `} as const;\n\n`;
  }
  
  // Add chip size tokens if exists
  if (Object.keys(sizing.chip).length > 0) {
    content += `// ============================================================================
// CHIP SIZES
// ============================================================================

export const chipSizes = {
`;
    Object.entries(sizing.chip).forEach(([key, value]) => {
      // Check if value is a reference (string starting with {)
      if (typeof value === 'string' && value.startsWith('{')) {
        // Output reference as-is (will be string in TS)
        content += `  ${quoteKeyIfNeeded(key)}: '${value}',\n`;
      } else {
        // Output number value
        content += `  ${quoteKeyIfNeeded(key)}: ${value},\n`;
      }
    });
    content += `} as const;\n\n`;
  }
  
  // Add target size tokens if exists
  if (Object.keys(sizing.target).length > 0) {
    content += `// ============================================================================
// TARGET SIZES
// ============================================================================

export const targetSizes = {
`;
    Object.entries(sizing.target).forEach(([key, value]) => {
      // Check if value is a reference (string starting with {)
      if (typeof value === 'string' && value.startsWith('{')) {
        // Output reference as-is (will be string in TS)
        content += `  ${quoteKeyIfNeeded(key)}: '${value}',\n`;
      } else {
        // Output number value
        content += `  ${quoteKeyIfNeeded(key)}: ${value},\n`;
      }
    });
    content += `} as const;\n\n`;
  }
  
  content += `// ============================================================================
// TYPES
// ============================================================================

export type TypographySizingKey = keyof typeof typographySizing;
`;
  
  if (Object.keys(sizing.spacing).length > 0) {
    content += `export type SpacingSystemKey = keyof typeof spacingSystem;\n`;
  }
  
  if (Object.keys(sizing.dimensions).length > 0) {
    content += `export type DimensionKey = keyof typeof dimensions;\n`;
  }
  
  if (Object.keys(sizing.radius).length > 0) {
    content += `export type RadiusKey = keyof typeof radius;\n`;
  }
  
  if (Object.keys(sizing.chip).length > 0) {
    content += `export type ChipSizeKey = keyof typeof chipSizes;\n`;
  }
  
  if (Object.keys(sizing.target).length > 0) {
    content += `export type TargetSizeKey = keyof typeof targetSizes;\n`;
  }
  
  fs.writeFileSync(path.join(CORE_DIR, 'sizing.ts'), content);
}

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
    
    // Parse Mode tokens (sizing system)
    const sizing = parseModeTokens();
    
    // Generate TypeScript files
    generateColorsFile(colors);
    generateTypographyFile(typography);
    generateSizesFile(sizes, opacity);
    generateSemanticFile(lightSemantic, darkSemantic, components);
    generateSizingFile(sizing);
    
    console.log('\n✅ Successfully imported tokens from Figma!');
    console.log('📁 Generated files in:', CORE_DIR);
  } catch (error) {
    console.error('❌ Error importing tokens:', error);
    process.exit(1);
  }
}

main();





