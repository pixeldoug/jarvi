# Design Tokens

> **⚠️ DEPRECATION NOTICE**
> 
> **This shared design tokens system is being phased out in favor of platform-specific design systems.**
> 
> - **Web**: Design tokens have been moved to `packages/web/src/design-system/`
>   - See [Web Design System README](../../web/src/design-system/README.md)
>   - All web components now use local tokens
>   - Storybook uses web-specific tokens
> 
> - **Mobile**: Will maintain platform-specific design system in `packages/mobile/src/theme/`
>   - Independent mobile design system under development
>   - Separate token generation workflow
> 
> This shared package will be maintained for backward compatibility only. **No new features will be added here.**
> 
> **Migration Status**: ✅ Web Complete | 🚧 Mobile In Progress

---

This folder contains the design system tokens for the Jarvi project.

## 📁 Folder Structure

```
design-tokens/
├── figma/                    # Source of truth - Figma exports
│   ├── Default.tokens.json  # Primitive tokens (colors, typography, spacing)
│   ├── Light.tokens.json    # Semantic + component tokens (light mode)
│   ├── Dark.tokens.json     # Semantic + component tokens (dark mode)
│   └── README.md
├── core/                     # Platform-agnostic TypeScript tokens
│   ├── colors.ts
│   ├── typography.ts
│   ├── spacing.ts
│   ├── semantic.ts
│   └── index.ts
├── platforms/                # Platform-specific outputs
│   ├── web/
│   │   ├── css-variables.css  # CSS custom properties for web
│   │   ├── tokens.ts         # TypeScript types
│   │   └── index.ts
│   └── native/
│       ├── tokens.ts         # React Native StyleSheet objects
│       └── index.ts
└── scripts/                  # Token generation scripts
    ├── import-from-figma.js
    ├── generate-web-tokens.js
    └── generate-native-tokens.js
```

## 🔄 Token Flow

```
Figma Design System
    ↓ (Export via Figma Tokens Plugin)
figma/*.tokens.json
    ↓ (npm run tokens:import)
core/*.ts (TypeScript tokens)
    ↓ (npm run tokens:generate-web / tokens:generate-native)
platforms/web/*.css + platforms/native/*.ts
    ↓ (Import in components)
Web & Mobile Apps
```

## 🚀 Commands

### Generate All Tokens
```bash
npm run tokens:generate
```
This command:
1. Imports tokens from Figma JSON files
2. Generates core TypeScript files
3. Generates platform-specific outputs (web CSS + native TS)

### Individual Commands

```bash
# Import from Figma and generate core tokens
npm run tokens:import

# Generate Web CSS variables
npm run tokens:generate-web

# Generate Native TypeScript objects
npm run tokens:generate-native

# Watch mode - auto-regenerate when Figma files change
npm run tokens:watch
```

## 📝 Workflow: Updating Tokens from Figma

1. **Open Figma**
   - Open your design file in Figma
   - Open the Figma Tokens Plugin

2. **Export Tokens**
   - Click "Export" in the plugin
   - Save the JSON files
   - Copy them to `figma/` folder (replace existing files)

3. **Generate Tokens**
   ```bash
   cd packages/shared
   npm run tokens:generate
   ```

4. **Commit Changes**
   ```bash
   git add src/design-tokens
   git commit -m "chore: update design tokens from Figma"
   ```

5. **Use in Your Apps**
   - Web and Mobile apps will automatically pick up the new tokens
   - No code changes needed unless tokens are added/removed

## 💻 Usage

### Web (CSS Variables)

```typescript
// Import in your main CSS file
@import '@shared/design-tokens/platforms/web/css-variables.css';

// Use in CSS
.button {
  background-color: var(--semantic-surface-surface-accent);
  color: var(--semantic-content-content-primary);
  padding: var(--spacing-4);
  border-radius: var(--spacing-2);
}

// Access theme
.dark .button {
  /* Dark mode variables are automatically applied */
}
```

### React Native (TypeScript Objects)

```typescript
import { StyleSheet } from 'react-native';
import { colors, spacing, lightTheme, darkTheme } from '@shared/design-tokens/platforms/native';

const styles = StyleSheet.create({
  button: {
    backgroundColor: lightTheme.semanticSurfaceSurfaceAccent,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: spacing[2],
  },
});
```

## 📚 Token Categories

### Primitive Tokens (Default.tokens.json)
- **Colors**: Base color palette (gray, brand, system colors)
- **Typography**: Font families, weights, sizes, letter spacing
- **Sizes**: Spacing scale, max-widths
- **Opacity**: Opacity values

### Semantic Tokens (Light/Dark.tokens.json)
- **Content**: Text colors for different contexts
- **Surface**: Background colors for different surfaces
- **Borders**: Border colors
- **Control**: Form control colors
- **Elevation**: Shadow colors

### Component Tokens (Light/Dark.tokens.json)
- **Button**: Primary, secondary, ghost, destructive variants
- **Calendar**: Day buttons, arrow buttons
- **Chip**: Interactive chip states
- **List Item**: List item states
- **Dialog**: Overlay colors
- **Control Bar**: Bottom bar colors

## 🎨 Theme System

The design system supports light and dark themes:

- **Web**: Uses CSS class `.dark` on the root element
- **Native**: Import `lightTheme` or `darkTheme` from tokens

### Switching Themes

**Web:**
```typescript
import { useTheme } from '@/hooks/useTheme';

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>Toggle Theme</button>;
}
```

**Native:**
```typescript
import { lightTheme, darkTheme, getTheme } from '@shared/design-tokens/platforms/native';
import { useColorScheme } from 'react-native';

const colorScheme = useColorScheme();
const theme = getTheme(colorScheme === 'dark' ? 'dark' : 'light');
```

## ⚠️ Important Notes

- **Never manually edit** files in `core/` or `platforms/` - they are auto-generated
- **Always update from Figma** - the JSON files are the source of truth
- **Commit token changes separately** from code changes
- **Test both themes** after updating tokens
- **Run tokens:generate** after pulling changes that include Figma JSON updates

## 🔗 Related Documentation

- [Figma Tokens Plugin](https://www.figma.com/community/plugin/843461159747178946)
- [Design System Implementation Plan](../../../.cursor/plans/multi-platform_design_system_*.plan.md)





