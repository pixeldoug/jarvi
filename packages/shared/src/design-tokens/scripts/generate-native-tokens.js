/**
 * Generate Native Tokens
 * 
 * This script generates TypeScript objects from core tokens for React Native
 */

const fs = require('fs');
const path = require('path');

const CORE_DIR = path.join(__dirname, '../core');
const NATIVE_OUTPUT_DIR = path.join(__dirname, '../platforms/native');

// Import core tokens
function loadTokens() {
  const colorsContent = fs.readFileSync(path.join(CORE_DIR, 'colors.ts'), 'utf-8');
  const typographyContent = fs.readFileSync(path.join(CORE_DIR, 'typography.ts'), 'utf-8');
  const spacingContent = fs.readFileSync(path.join(CORE_DIR, 'spacing.ts'), 'utf-8');
  const semanticContent = fs.readFileSync(path.join(CORE_DIR, 'semantic.ts'), 'utf-8');
  
  // Extract JSON from TypeScript files
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

// Flatten nested object with camelCase keys
function flattenObject(obj, prefix = '') {
  let result = {};
  
  Object.entries(obj).forEach(([key, value]) => {
    const newKey = prefix ? `${prefix}${key.charAt(0).toUpperCase() + key.slice(1)}` : key;
    
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively flatten
      Object.assign(result, flattenObject(value, newKey));
    } else {
      result[newKey] = value;
    }
  });
  
  return result;
}

// Generate TypeScript content
function generateNativeTokens(tokens) {
  let content = `/**
 * Design Tokens for React Native
 * Generated from Figma tokens
 * DO NOT EDIT MANUALLY
 * 
 * Import and use directly in your React Native StyleSheet.create() calls
 */

/* ========================================
   PRIMITIVE TOKENS
   ======================================== */

`;

  // Generate colors
  const flatColors = flattenObject(tokens.colors);
  content += `export const colors = ${JSON.stringify(flatColors, null, 2)} as const;\n\n`;

  // Generate typography
  content += `export const fontFamily = ${JSON.stringify(tokens.typography.fontFamily, null, 2)} as const;\n\n`;
  content += `export const fontWeight = ${JSON.stringify(tokens.typography.fontWeight, null, 2)} as const;\n\n`;
  content += `export const fontStyle = ${JSON.stringify(tokens.typography.fontStyle, null, 2)} as const;\n\n`;
  content += `export const letterSpacing = ${JSON.stringify(tokens.typography.letterSpacing, null, 2)} as const;\n\n`;

  // Generate spacing (numbers for React Native)
  content += `export const spacing = ${JSON.stringify(tokens.spacing, null, 2)} as const;\n\n`;
  content += `export const opacity = ${JSON.stringify(tokens.opacity, null, 2)} as const;\n\n`;

  // Generate semantic tokens for themes
  content += `/* ========================================
   SEMANTIC TOKENS (THEMES)
   ======================================== */

`;

  const lightSemanticFlat = flattenObject(tokens.semanticTokens.light);
  const darkSemanticFlat = flattenObject(tokens.semanticTokens.dark);

  content += `export const lightTheme = {
  ...${JSON.stringify(lightSemanticFlat, null, 2).replace(/^{/, '').replace(/}$/, '').trim()},
  // Component tokens
  ...${JSON.stringify(flattenObject(tokens.componentTokens.light), null, 2).replace(/^{/, '').replace(/}$/, '').trim()}
} as const;\n\n`;

  content += `export const darkTheme = {
  ...${JSON.stringify(darkSemanticFlat, null, 2).replace(/^{/, '').replace(/}$/, '').trim()},
  // Component tokens
  ...${JSON.stringify(flattenObject(tokens.componentTokens.dark), null, 2).replace(/^{/, '').replace(/}$/, '').trim()}
} as const;\n\n`;

  // Add theme types
  content += `/* ========================================
   TYPES
   ======================================== */

export type ThemeMode = 'light' | 'dark';
export type Theme = typeof lightTheme;
export type ColorKey = keyof typeof colors;
export type SpacingKey = keyof typeof spacing;
export type FontFamilyKey = keyof typeof fontFamily;

/**
 * Get theme based on mode
 */
export function getTheme(mode: ThemeMode): Theme {
  return mode === 'dark' ? darkTheme : lightTheme;
}
`;

  // Add usage example
  content += `\n/* ========================================
   USAGE EXAMPLE
   ======================================== */

/*
import { StyleSheet } from 'react-native';
import { colors, spacing, lightTheme, fontFamily } from '@shared/design-tokens/platforms/native';

const styles = StyleSheet.create({
  button: {
    backgroundColor: lightTheme.semanticSurfaceSurfaceAccent,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: spacing[2],
  },
  text: {
    color: lightTheme.semanticContentContentPrimary,
    fontFamily: fontFamily['font-ui'],
  },
});
*/
`;

  return content;
}

// Main execution
async function main() {
  console.log('📱 Generating Native tokens (React Native)...\n');
  
  // Ensure output directory exists
  if (!fs.existsSync(NATIVE_OUTPUT_DIR)) {
    fs.mkdirSync(NATIVE_OUTPUT_DIR, { recursive: true });
  }
  
  try {
    // Load tokens
    const tokens = loadTokens();
    
    // Generate TypeScript file
    const content = generateNativeTokens(tokens);
    fs.writeFileSync(path.join(NATIVE_OUTPUT_DIR, 'tokens.ts'), content);
    console.log('✓ Generated tokens.ts');
    
    // Update index.ts
    const indexContent = `/**
 * Native Platform Tokens
 * 
 * Generated TypeScript objects for React Native platform
 * Import these directly in your React Native components
 */

export * from './tokens';
`;
    fs.writeFileSync(path.join(NATIVE_OUTPUT_DIR, 'index.ts'), indexContent);
    console.log('✓ Updated index.ts');
    
    console.log('\n✅ Successfully generated Native tokens!');
    console.log('📁 Output directory:', NATIVE_OUTPUT_DIR);
    console.log('\n💡 Import in your React Native app:');
    console.log('   import { colors, spacing, lightTheme, darkTheme } from \'@shared/design-tokens/platforms/native\';');
  } catch (error) {
    console.error('❌ Error generating Native tokens:', error);
    process.exit(1);
  }
}

main();






















