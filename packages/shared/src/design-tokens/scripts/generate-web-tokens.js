/**
 * Generate Web Tokens
 * 
 * This script generates CSS variables from core tokens for the Web platform
 */

const fs = require('fs');
const path = require('path');

const CORE_DIR = path.join(__dirname, '../core');
const WEB_OUTPUT_DIR = path.join(__dirname, '../platforms/web');

// Import core tokens (using require with .js extension for Node)
function loadTokens() {
  // Read the generated TypeScript files and extract the JSON data
  const colorsContent = fs.readFileSync(path.join(CORE_DIR, 'colors.ts'), 'utf-8');
  const typographyContent = fs.readFileSync(path.join(CORE_DIR, 'typography.ts'), 'utf-8');
  const spacingContent = fs.readFileSync(path.join(CORE_DIR, 'spacing.ts'), 'utf-8');
  const semanticContent = fs.readFileSync(path.join(CORE_DIR, 'semantic.ts'), 'utf-8');
  
  // Extract JSON from TypeScript files (simple regex approach)
  const extractJson = (content, varName) => {
    const regex = new RegExp(`export const ${varName} = ({[\\s\\S]*?}) as const;`);
    const match = content.match(regex);
    if (match) {
      return eval('(' + match[1] + ')');
    }
    return {};
  };
  
  return {
    colors: extractJson(colorsContent, 'colors'),
    typography: extractJson(typographyContent, 'typography'),
    spacing: extractJson(spacingContent, 'spacing'),
    opacity: extractJson(spacingContent, 'opacity'),
    semanticTokens: extractJson(semanticContent, 'semanticTokens'),
    componentTokens: extractJson(semanticContent, 'componentTokens'),
  };
}

// Convert camelCase to kebab-case
function toKebabCase(str) {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

// Flatten nested object to CSS variable format
function flattenToCSSVars(obj, prefix = '') {
  let vars = [];
  
  Object.entries(obj).forEach(([key, value]) => {
    const varName = prefix ? `${prefix}-${toKebabCase(key)}` : toKebabCase(key);
    
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively flatten nested objects
      vars = vars.concat(flattenToCSSVars(value, varName));
    } else {
      // Convert number values to px for spacing, keep as-is for opacity
      const cssValue = typeof value === 'number' && !prefix.includes('opacity') 
        ? `${value}px` 
        : value;
      vars.push(`  --${varName}: ${cssValue};`);
    }
  });
  
  return vars;
}

// Generate CSS variables
function generateCSSVariables(tokens) {
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
  css += flattenToCSSVars(tokens.colors, 'color').join('\n') + '\n\n';

  // Add typography
  css += '  /* ===== Typography ===== */\n';
  css += flattenToCSSVars(tokens.typography, 'font').join('\n') + '\n\n';

  // Add spacing
  css += '  /* ===== Spacing ===== */\n';
  css += flattenToCSSVars(tokens.spacing, 'spacing').join('\n') + '\n\n';

  // Add opacity
  css += '  /* ===== Opacity ===== */\n';
  css += flattenToCSSVars(tokens.opacity, 'opacity').join('\n') + '\n\n';

  // Add semantic tokens (light mode)
  css += '  /* ===== Semantic Tokens (Light Mode) ===== */\n';
  css += flattenToCSSVars(tokens.semanticTokens.light, 'semantic').join('\n') + '\n\n';

  // Add component tokens (light mode)
  css += '  /* ===== Component Tokens (Light Mode) ===== */\n';
  css += flattenToCSSVars(tokens.componentTokens.light, 'component').join('\n') + '\n';

  css += '}\n\n';

  // Dark mode
  css += `/* ========================================
   DARK MODE OVERRIDES
   ======================================== */

.dark {
  /* ===== Semantic Tokens (Dark Mode) ===== */
`;

  css += flattenToCSSVars(tokens.semanticTokens.dark, 'semantic').join('\n') + '\n\n';

  css += '  /* ===== Component Tokens (Dark Mode) ===== */\n';
  css += flattenToCSSVars(tokens.componentTokens.dark, 'component').join('\n') + '\n';

  css += '}\n\n';

  // Add utility comment
  css += `/* ========================================
   USAGE EXAMPLE
   ======================================== */

/*
.my-button {
  background-color: var(--semantic-surface-surface-accent);
  color: var(--semantic-content-content-primary);
  padding: var(--spacing-4);
  border-radius: var(--spacing-2);
  font-family: var(--font-font-family-font-ui);
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
export * from '../../core';

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
    console.log('   @import \'@shared/design-tokens/platforms/web/css-variables.css\';');
  } catch (error) {
    console.error('❌ Error generating Web tokens:', error);
    process.exit(1);
  }
}

main();






















