# Design System - Quick Reference

Quick reference for common tasks and patterns.

---

## 🚀 Quick Commands

```bash
# Generate all tokens from Figma
cd packages/shared && npm run tokens:generate

# Watch mode (auto-regenerate on Figma changes)
cd packages/shared && npm run tokens:watch

# Individual generation
npm run tokens:import          # Figma → Core tokens
npm run tokens:generate-web    # Core → Web CSS
npm run tokens:generate-native # Core → Native TS
```

---

## 🎨 Common Token Patterns

### Web (CSS Variables)

```css
/* Colors */
background-color: var(--semantic-surface-surface-primary);
color: var(--semantic-content-content-primary);
border-color: var(--semantic-borders-border-primary);

/* Spacing */
padding: var(--spacing-4);
margin: var(--spacing-2);
gap: var(--spacing-3);

/* Sizing */
border-radius: var(--spacing-2);
width: var(--spacing-16);

/* Elevation */
box-shadow: var(--semantic-elevation-shadow-md);
```

### Native (TypeScript)

```typescript
import { useTheme } from '../../hooks/useTheme';
import { spacing } from '@jarvi/shared/src/design-tokens/platforms/native';

const { theme } = useTheme();

const styles = StyleSheet.create({
  container: {
    // Colors (from theme)
    backgroundColor: theme.semanticSurfaceSurfacePrimary,
    borderColor: theme.semanticBordersBorderPrimary,
    
    // Spacing (static)
    padding: spacing[4],
    margin: spacing[2],
    gap: spacing[3],
    
    // Sizing
    borderRadius: spacing[2],
    width: spacing[16],
  },
});
```

---

## 🌓 Theme Switching

### Web

```typescript
import { useTheme } from '@/hooks/useTheme';

function ThemeToggle() {
  const { theme, toggleTheme, isDark } = useTheme();
  
  return (
    <button onClick={toggleTheme}>
      {isDark ? '☀️ Light' : '🌙 Dark'}
    </button>
  );
}
```

### Native

```typescript
import { useTheme } from '../../hooks/useTheme';

function Settings() {
  const { theme, toggleTheme, isDark } = useTheme();
  
  return (
    <TouchableOpacity onPress={toggleTheme}>
      <Text>{isDark ? '☀️ Light Mode' : '🌙 Dark Mode'}</Text>
    </TouchableOpacity>
  );
}
```

---

## 🧩 Component Examples

### Button

**Web:**
```typescript
import { Button } from '@/components/ui/Button';

<Button variant="primary" size="md">
  Submit
</Button>
```

**Native:**
```typescript
import { Button } from '@/components/ui/Button';

<Button variant="primary" size="md" onPress={handlePress}>
  Submit
</Button>
```

**Variants:** `primary`, `secondary`, `outline`, `ghost`, `destructive`
**Sizes:** `sm`, `md`, `lg`

### Card

**Web:**
```typescript
import { Card } from '@/components/ui/Card';

<Card padding="md" shadow="md" rounded="lg">
  {children}
</Card>
```

**Native:**
```typescript
import { Card } from '@/components/ui/Card';

<Card padding="md">
  {children}
</Card>
```

**Padding:** `none`, `sm`, `md`, `lg`

### Input

**Web:**
```typescript
import { Input } from '@/components/ui/Input';

<Input
  type="email"
  label="Email"
  placeholder="Enter your email"
  error={errors.email}
/>
```

**Native:**
```typescript
import { Input } from '@/components/ui/Input';

<Input
  type="email"
  label="Email"
  placeholder="Enter your email"
  error={errors.email}
/>
```

**Types:** `text`, `email`, `password`, `number`, `tel`

---

## 📂 Import Paths

### Web

```typescript
// Components
import { Button } from '@/components/ui/Button';

// Hooks
import { useTheme } from '@/hooks/useTheme';

// In CSS: Use CSS variables directly
var(--semantic-surface-surface-primary)
```

### Native

```typescript
// Components
import { Button } from '@/components/ui/Button';

// Theme Hook
import { useTheme } from '../../hooks/useTheme';

// Static Tokens
import { spacing, colors } from '@jarvi/shared/src/design-tokens/platforms/native';

// Theme Provider (wrap app)
import { ThemeProvider } from './src/theme/provider';
```

---

## 🎨 Token Categories

### Semantic Tokens (Theme-aware)

**Content (Text colors):**
- `content-primary` - Main text
- `content-secondary` - Secondary text
- `content-tertiary` - Muted text
- `content-disabled` - Disabled text
- `content-error` - Error text

**Surface (Backgrounds):**
- `surface-primary` - Main background
- `surface-secondary` - Secondary background
- `surface-tertiary` - Tertiary background
- `surface-accent` - Accent background

**Borders:**
- `border-primary` - Main borders
- `border-secondary` - Secondary borders
- `border-tertiary` - Tertiary borders

**Control (Form elements):**
- `control-bg` - Control background
- `control-border-default` - Control border
- `control-border-active` - Active/focus border

### Component Tokens

**Button:**
- `button-primary-*` - Primary button colors
- `button-secondary-*` - Secondary button colors
- `button-ghost-*` - Ghost button colors
- `button-destructive-*` - Destructive button colors

Each variant has: `bg-default`, `bg-hover`, `bg-pressed`, `border-default`, `content-default`

---

## 🔄 Update Workflow

1. **Design in Figma**
   - Update variables and components in Figma

2. **Export Tokens**
   - Use Figma Tokens Plugin
   - Export to `packages/shared/src/design-tokens/figma/`

3. **Generate Tokens**
   ```bash
   cd packages/shared
   npm run tokens:generate
   ```

4. **Commit & Push**
   ```bash
   git add src/design-tokens
   git commit -m "chore: update design tokens from Figma"
   git push
   ```

5. **Test Both Platforms**
   - Verify Web app
   - Verify Native app
   - Test light and dark modes

---

## 🐛 Common Issues

### CSS variables not working (Web)
✅ **Solution:** Import globals in main file
```typescript
import './styles/globals.css';
```

### Tokens not found (Native)
✅ **Solution:** Run token generation
```bash
cd packages/shared && npm run tokens:generate
```

### Theme not persisting (Native)
✅ **Solution:** Install AsyncStorage
```bash
npm install @react-native-async-storage/async-storage
```

### Dark mode not working (Web)
✅ **Solution:** Check useTheme applies `.dark` class to `<html>`

### Dark mode not working (Native)
✅ **Solution:** Wrap app with `<ThemeProvider>`

---

## 📏 Spacing Scale

```
spacing[1] = 4px
spacing[2] = 8px
spacing[3] = 12px
spacing[4] = 16px
spacing[5] = 20px
spacing[6] = 24px
spacing[8] = 32px
spacing[10] = 40px
spacing[12] = 48px
spacing[16] = 64px
spacing[20] = 80px
```

**Usage:**
- Web: `var(--spacing-4)` = 16px
- Native: `spacing[4]` = 16

---

## 🎯 Best Practices

✅ **DO:**
- Use semantic tokens (`semantic-surface-*`) for theme-aware colors
- Use spacing scale for consistent spacing
- Test both light and dark modes
- Run `tokens:generate` after Figma updates
- Commit token changes separately

❌ **DON'T:**
- Manually edit generated files
- Use hardcoded colors/spacing
- Mix Tailwind with CSS variables
- Forget to test dark mode
- Commit Figma files with code changes

---

## 📚 Full Documentation

- **Migration Guide**: `MIGRATION_GUIDE.md`
- **Implementation Summary**: `DESIGN_SYSTEM_SUMMARY.md`
- **Token Workflow**: `packages/shared/src/design-tokens/README.md`
- **Completion Status**: `IMPLEMENTATION_COMPLETE.md`

---

**Last Updated:** December 11, 2024

