# Web Design System

This is the **Web Design System** for the Jarvi web application. It contains design tokens, components, and tooling specific to the web platform.

## Important Note

This design system is **web-only** and lives co-located with the web application. Mobile apps have their own design system with different surface tokens and may evolve independently.

## Folder Structure

```
design-system/
├── tokens/
│   ├── figma/                  # Source of truth - Figma exports
│   │   ├── Default.tokens.json # Primitive tokens (colors, typography, spacing)
│   │   ├── Light.tokens.json   # Semantic + component tokens (light mode)
│   │   ├── Dark.tokens.json    # Semantic + component tokens (dark mode)
│   │   └── README.md
│   ├── core/                   # Platform-agnostic TypeScript tokens (generated)
│   │   ├── colors.ts
│   │   ├── spacing.ts
│   │   ├── typography.ts
│   │   ├── semantic.ts
│   │   └── index.ts
│   ├── css-variables.css       # Generated CSS custom properties for web
│   ├── tokens.ts               # TypeScript types for tokens
│   └── index.ts                # Token exports
└── scripts/                    # Token generation scripts
    ├── import-from-figma.js    # Parse Figma JSON → core TypeScript
    └── generate-tokens.js      # Generate css-variables.css from core
```

## Token Flow

```mermaid
flowchart LR
    Figma[Figma Design System] -->|Export via Plugin| JSON[figma/*.tokens.json]
    JSON -->|npm run tokens:import| Core[tokens/core/*.ts]
    Core -->|npm run tokens:generate| CSS[tokens/css-variables.css]
    CSS -->|@import| WebApp[Web Components]
    CSS -->|@import| Storybook[Storybook]
```

## Commands

### Generate All Tokens

```bash
npm run tokens:generate
```

This command:
1. Imports tokens from Figma JSON files (`tokens:import`)
2. Generates core TypeScript files in `tokens/core/`
3. Generates `css-variables.css` from core tokens

### Individual Commands

```bash
# Import from Figma and generate core tokens
npm run tokens:import

# Watch mode - auto-regenerate when Figma files change
npm run tokens:watch
```

## Workflow: Updating Tokens from Figma

1. **Open Figma**
   - Open your design file in Figma
   - Open the Figma Tokens Plugin

2. **Export Tokens**
   - Click "Export" in the plugin
   - Save the JSON files
   - Copy them to `src/design-system/tokens/figma/` (replace existing files)

3. **Generate Tokens**
   ```bash
   cd packages/web
   npm run tokens:generate
   ```

4. **Verify Changes**
   - Check `tokens/css-variables.css` for new variables
   - Test in Storybook: `npm run storybook`
   - Test in app: `npm run dev`

5. **Commit Changes**
   ```bash
   git add src/design-system
   git commit -m "chore: update design tokens from Figma"
   ```

## Usage

### In CSS Modules

```css
/* Import tokens in your main CSS file (done in src/styles/tokens.css) */
@import url('../design-system/tokens/css-variables.css');

/* Use in component CSS */
.button {
  background-color: var(--component-button-primary-bg-default);
  color: var(--component-button-primary-content-default);
  padding: var(--spacing-4);
  border-radius: var(--radius-button-radius);
  font-family: var(--font-font-family-font-ui);
}

/* Dark mode - tokens are automatically applied via .dark class */
.dark .button {
  /* Dark mode variables are automatically used */
}
```

### In Storybook

Tokens are automatically available in Storybook via the preview.ts configuration. All stories will have access to the same design tokens as the main app.

## Token Categories

### Primitive Tokens (Default.tokens.json)
- **Colors**: Base color palette (gray, brand, system colors)
- **Typography**: Font families, weights, sizes, letter spacing
- **Sizes**: Spacing scale (4px, 8px, 12px, etc.)
- **Opacity**: Opacity values (0.1, 0.15, 0.2, etc.)

### Mode Tokens (Mode.tokens.json)
Typography and sizing system built upon primitives:
- **Typography Sizing**: Complete typography scale with:
  - `display-lg`: 64px / 80px line height
  - `heading-lg`, `heading-md`, `heading-sm`: 32px, 24px, 20px
  - `body-lg`, `body-md`, `body-sm`: 16px, 14px, 13px
  - `label-md`, `label-sm`: 15px, 11px
  - Each includes font-size, line-height, font-weight, letter-spacing
- **Spacing System**: Contextual spacing values
- **Dimensions**: Component-specific dimensions

**Usage Example:**
```css
.my-heading {
  font-size: var(--typography-heading-lg-font-size);
  line-height: var(--typography-heading-lg-line-height);
  font-weight: var(--typography-heading-lg-font-weight);
}
```

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

## Theme System

The design system supports light and dark themes using CSS classes.

### Theme Switching

```typescript
import { useTheme } from '../../contexts/ThemeContext';

function ThemeToggle() {
  const { theme, toggleTheme, isDark } = useTheme();
  
  return (
    <button onClick={toggleTheme}>
      {isDark ? 'Light Mode' : 'Dark Mode'}
    </button>
  );
}
```

The theme hook automatically applies the `.dark` class to the document root, which activates dark mode token overrides.

## Important Notes

- **Never manually edit** files in `tokens/core/` or `tokens/css-variables.css` - they are auto-generated
- **Always update from Figma** - the JSON files are the source of truth
- **Commit token changes separately** from code changes
- **Test both themes** after updating tokens
- **Run tokens:generate** after pulling changes that include Figma JSON updates

## Why Web-Only?

This design system is intentionally kept web-specific because:

1. **Different Surface Needs**: Web and mobile have different component requirements and surface tokens
2. **Independent Evolution**: Web can update tokens without affecting mobile
3. **Simpler Imports**: No cross-package complexity or monorepo aliasing issues
4. **Storybook Compatibility**: Tokens live where they're consumed
5. **Clear Ownership**: Obvious that these tokens are for web

Mobile apps will have their own design system in `packages/mobile/src/design-system/` when needed.

## Related Documentation

- [Figma Tokens Plugin](https://www.figma.com/community/plugin/843461159747178946)
- [Component Documentation](../components/README.md)
- [Storybook Documentation](../../.storybook/README.md)
