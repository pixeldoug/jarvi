/**
 * Generate Web Tokens
 * 
 * This script generates CSS variables from core tokens for the Web platform
 */

const fs = require('fs');
const path = require('path');

const CORE_DIR = path.join(__dirname, '../tokens/core');
const WEB_OUTPUT_DIR = path.join(__dirname, '../tokens');

// Import core tokens (using require with .js extension for Node)
function loadTokens() {
  // Read the generated TypeScript files and extract the JSON data
  const colorsContent = fs.readFileSync(path.join(CORE_DIR, 'colors.ts'), 'utf-8');
  const typographyContent = fs.readFileSync(path.join(CORE_DIR, 'typography.ts'), 'utf-8');
  const sizesContent = fs.readFileSync(path.join(CORE_DIR, 'sizes.ts'), 'utf-8');
  const semanticContent = fs.readFileSync(path.join(CORE_DIR, 'semantic.ts'), 'utf-8');
  
  // Check if sizing.ts exists
  let sizingContent = null;
  const sizingPath = path.join(CORE_DIR, 'sizing.ts');
  if (fs.existsSync(sizingPath)) {
    sizingContent = fs.readFileSync(sizingPath, 'utf-8');
  }
  
  // Extract JSON from TypeScript files (simple regex approach)
  const extractJson = (content, varName) => {
    const regex = new RegExp(`export const ${varName} = ({[\\s\\S]*?}) as const;`);
    const match = content.match(regex);
    if (match) {
      return eval('(' + match[1] + ')');
    }
    return {};
  };
  
  const tokens = {
    colors: extractJson(colorsContent, 'colors'),
    typography: extractJson(typographyContent, 'typography'),
    sizes: extractJson(sizesContent, 'sizes'),
    opacity: extractJson(sizesContent, 'opacity'),
    semanticTokens: extractJson(semanticContent, 'semanticTokens'),
    componentTokens: extractJson(semanticContent, 'componentTokens'),
  };
  
  // Add sizing tokens if available
  if (sizingContent) {
    tokens.typographySizing = extractJson(sizingContent, 'typographySizing');
    tokens.spacingSystem = extractJson(sizingContent, 'spacingSystem');
    tokens.dimensions = extractJson(sizingContent, 'dimensions');
    tokens.radius = extractJson(sizingContent, 'radius');
    tokens.chipSizes = extractJson(sizingContent, 'chipSizes');
    tokens.targetSizes = extractJson(sizingContent, 'targetSizes');
  }
  
  return tokens;
}

// Convert camelCase to kebab-case
function toKebabCase(str) {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

// Resolve token references like {Semantic.surface.surface-accent}
function resolveTokenReference(value, allVars) {
  // If not a string or not a reference, return as-is
  if (typeof value !== 'string' || !value.startsWith('{') || !value.endsWith('}')) {
    return value;
  }
  
  // Extract reference path: {Semantic.surface.surface-accent} -> Semantic.surface.surface-accent
  const refPath = value.slice(1, -1);
  
  // Convert to CSS variable format: Semantic.surface.surface-accent -> --semantic-surface-accent
  const cssVarName = '--' + refPath
    .split('.')
    .map(part => toKebabCase(part))
    .join('-');
  
  // Look up the actual value in allVars
  const actualValue = allVars[cssVarName];
  
  if (actualValue) {
    // If we found the value, check if it's also a reference (recursive resolution)
    if (typeof actualValue === 'string' && actualValue.startsWith('{')) {
      return resolveTokenReference(actualValue, allVars);
    }
    return actualValue;
  }
  
  // If not found, return as CSS var() reference
  return `var(${cssVarName})`;
}

// Flatten nested object to CSS variable format
function flattenToCSSVars(obj, prefix = '', allVars = {}) {
  let vars = [];
  
  Object.entries(obj).forEach(([key, value]) => {
    const varName = prefix ? `${prefix}-${toKebabCase(key)}` : toKebabCase(key);
    const fullVarName = `--${varName}`;
    
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively flatten nested objects
      vars = vars.concat(flattenToCSSVars(value, varName, allVars));
    } else {
      // Convert number values to px for spacing, keep as-is for opacity
      let cssValue = typeof value === 'number' && !prefix.includes('opacity') 
        ? `${value}px` 
        : value;
      
      // Resolve token references
      cssValue = resolveTokenReference(cssValue, allVars);
      
      // Store in allVars map for future reference resolution
      allVars[fullVarName] = cssValue;
      
      vars.push(`  ${fullVarName}: ${cssValue};`);
    }
  });
  
  return vars;
}

// Generate CSS variables
function generateCSSVariables(tokens) {
  // First pass: Build a map of all variables (without resolving references yet)
  const allVars = {};
  
  // Helper to collect all vars without resolution
  const collectVars = (obj, prefix = '') => {
    Object.entries(obj).forEach(([key, value]) => {
      const varName = prefix ? `${prefix}-${toKebabCase(key)}` : toKebabCase(key);
      const fullVarName = `--${varName}`;
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        collectVars(value, varName);
      } else {
        let cssValue = typeof value === 'number' && !prefix.includes('opacity') 
          ? `${value}px` 
          : value;
        allVars[fullVarName] = cssValue;
      }
    });
  };
  
  // Collect all variables first
  collectVars(tokens.colors, 'color');
  collectVars(tokens.typography, 'font');
  collectVars(tokens.sizes, 'sizes');
  collectVars(tokens.opacity, 'opacity');
  collectVars(tokens.semanticTokens.light, 'semantic');
  collectVars(tokens.componentTokens.light, 'component');
  collectVars(tokens.semanticTokens.dark, 'semantic');
  collectVars(tokens.componentTokens.dark, 'component');
  
  if (tokens.typographySizing) {
    Object.entries(tokens.typographySizing).forEach(([key, value]) => {
      const kebabKey = toKebabCase(key);
      allVars[`--typography-${kebabKey}-font-size`] = `${value.fontSize}px`;
      allVars[`--typography-${kebabKey}-line-height`] = `${value.lineHeight}px`;
      allVars[`--typography-${kebabKey}-font-weight`] = value.fontWeight;
      allVars[`--typography-${kebabKey}-letter-spacing`] = `${value.letterSpacing}px`;
    });
  }
  
  if (tokens.spacingSystem) {
    collectVars(tokens.spacingSystem, 'spacing-system');
  }
  
  if (tokens.dimensions) {
    collectVars(tokens.dimensions, 'dimension');
  }
  
  if (tokens.chipSizes) {
    collectVars(tokens.chipSizes, 'size-chip');
  }
  
  if (tokens.targetSizes) {
    collectVars(tokens.targetSizes, 'size-target');
  }
  
  // Now resolve all references
  Object.keys(allVars).forEach(varName => {
    allVars[varName] = resolveTokenReference(allVars[varName], allVars);
  });
  
  // Second pass: Generate CSS with resolved values
  let css = `/**
 * Design Tokens - CSS Variables
 * Generated from Figma tokens
 * DO NOT EDIT MANUALLY
 */

/* ========================================
   ROOT VARIABLES (Light Mode Default)
   ======================================== */

:root {
  /* ===== Colors ===== */
`;

  // Add primitive colors
  css += flattenToCSSVars(tokens.colors, 'color', allVars).join('\n') + '\n\n';

  // Add typography
  css += '  /* ===== Typography ===== */\n';
  css += flattenToCSSVars(tokens.typography, 'font', allVars).join('\n') + '\n\n';

  // Add sizes
  css += '  /* ===== Sizes ===== */\n';
  css += flattenToCSSVars(tokens.sizes, 'sizes', allVars).join('\n') + '\n\n';

  // Add opacity
  css += '  /* ===== Opacity ===== */\n';
  css += flattenToCSSVars(tokens.opacity, 'opacity', allVars).join('\n') + '\n\n';
  
  // Add typography sizing if available
  if (tokens.typographySizing && Object.keys(tokens.typographySizing).length > 0) {
    css += '  /* ===== Typography Sizing (Mode) ===== */\n';
    Object.entries(tokens.typographySizing).forEach(([key, value]) => {
      // Mantém kebab-case original
      const kebabKey = key;
      css += `  --typography-${kebabKey}-font-size: ${allVars[`--typography-${kebabKey}-font-size`]};\n`;
      css += `  --typography-${kebabKey}-line-height: ${allVars[`--typography-${kebabKey}-line-height`]};\n`;
      css += `  --typography-${kebabKey}-font-weight: ${allVars[`--typography-${kebabKey}-font-weight`]};\n`;
      css += `  --typography-${kebabKey}-letter-spacing: ${allVars[`--typography-${kebabKey}-letter-spacing`]};\n`;
    });
    css += '\n';
  }
  
  // Add spacing system if available
  if (tokens.spacingSystem && Object.keys(tokens.spacingSystem).length > 0) {
    css += '  /* ===== Spacing System (Mode) ===== */\n';
    css += flattenToCSSVars(tokens.spacingSystem, 'spacing-system', allVars).join('\n') + '\n\n';
  }
  
  // Add dimensions if available
  if (tokens.dimensions && Object.keys(tokens.dimensions).length > 0) {
    css += '  /* ===== Dimensions (Mode) ===== */\n';
    css += flattenToCSSVars(tokens.dimensions, 'dimension', allVars).join('\n') + '\n\n';
  }
  
  // Add radius if available
  if (tokens.radius && Object.keys(tokens.radius).length > 0) {
    css += '  /* ===== Radius (Mode) ===== */\n';
    css += flattenToCSSVars(tokens.radius, 'radius', allVars).join('\n') + '\n\n';
  }

  // Add target sizes if available (must come before chip sizes for reference resolution)
  if (tokens.targetSizes && Object.keys(tokens.targetSizes).length > 0) {
    css += '  /* ===== Target Sizes (Mode) ===== */\n';
    css += flattenToCSSVars(tokens.targetSizes, 'size-target', allVars).join('\n') + '\n\n';
  }

  // Add chip sizes if available
  if (tokens.chipSizes && Object.keys(tokens.chipSizes).length > 0) {
    css += '  /* ===== Chip Sizes (Mode) ===== */\n';
    css += flattenToCSSVars(tokens.chipSizes, 'size-chip', allVars).join('\n') + '\n\n';
  }

  // Add semantic tokens (light mode)
  css += '  /* ===== Semantic Tokens (Light Mode) ===== */\n';
  css += flattenToCSSVars(tokens.semanticTokens.light, 'semantic', allVars).join('\n') + '\n\n';

  // Add component tokens (light mode)
  css += '  /* ===== Component Tokens (Light Mode) ===== */\n';
  css += flattenToCSSVars(tokens.componentTokens.light, 'component', allVars).join('\n') + '\n';

  css += '}\n\n';

  // Dark mode
  css += `/* ========================================
   DARK MODE OVERRIDES
   ======================================== */

.dark,
[data-theme="dark"] {
  /* ===== Semantic Tokens (Dark Mode) ===== */
`;

  css += flattenToCSSVars(tokens.semanticTokens.dark, 'semantic', allVars).join('\n') + '\n\n';

  css += '  /* ===== Component Tokens (Dark Mode) ===== */\n';
  css += flattenToCSSVars(tokens.componentTokens.dark, 'component', allVars).join('\n') + '\n';

  css += '}\n\n';

  // Add utility comment
  css += `/* ========================================
   USAGE EXAMPLE
   ======================================== */

/*
.my-button {
  background-color: var(--semantic-surface-accent);
  color: var(--semantic-content-primary);
  padding: var(--spacing-4);
  border-radius: var(--spacing-2);
  font-family: var(--font-font-family-font-ui);
  font-size: var(--typography-body-lg-font-size);
  line-height: var(--typography-body-lg-line-height);
}
*/
`;

  return css;
}

// Generate TypeScript types file for autocomplete
function generateTypesFile() {
  const content = `/**
 * Web Token Types
 * Generated TypeScript types for CSS variables
 * Provides autocomplete support for design tokens
 */

// Re-export core tokens for programmatic access
export * from './core';

/**
 * CSS Variable names as TypeScript types
 * Use these with \`var(--variable-name)\` in your CSS
 */
export type CSSVariable = 
  | \`--color-\${string}\`
  | \`--font-\${string}\`
  | \`--spacing-\${string}\`
  | \`--opacity-\${string}\`
  | \`--semantic-\${string}\`
  | \`--component-\${string}\`;

/**
 * Helper function to get CSS variable
 * @param varName CSS variable name without --
 * @returns CSS var() function string
 */
export function cssVar(varName: string): string {
  return \`var(--\${varName})\`;
}
`;

  fs.writeFileSync(path.join(WEB_OUTPUT_DIR, 'tokens.ts'), content);
  console.log('✓ Generated tokens.ts');
}

// Main execution
async function main() {
  console.log('🌐 Generating Web tokens (CSS variables)...\n');
  
  // Ensure output directory exists
  if (!fs.existsSync(WEB_OUTPUT_DIR)) {
    fs.mkdirSync(WEB_OUTPUT_DIR, { recursive: true });
  }
  
  try {
    // Load tokens
    const tokens = loadTokens();
    
    // Generate CSS variables
    const css = generateCSSVariables(tokens);
    fs.writeFileSync(path.join(WEB_OUTPUT_DIR, 'css-variables.css'), css);
    console.log('✓ Generated css-variables.css');
    
    // Generate TypeScript types
    generateTypesFile();
    
    console.log('\n✅ Successfully generated Web tokens!');
    console.log('📁 Output directory:', WEB_OUTPUT_DIR);
    console.log('\n💡 Import in your web app:');
    console.log('   @import \'../design-system/tokens/css-variables.css\';');
  } catch (error) {
    console.error('❌ Error generating Web tokens:', error);
    process.exit(1);
  }
}

main();





