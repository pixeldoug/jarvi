# Migration Guide - New Design System

This guide helps you update your existing codebase to use the new design system implementation.

---

## 🚀 Quick Start

### 1. Generate Tokens

First, generate all tokens from your Figma exports:

```bash
cd packages/shared
npm run tokens:generate
```

This will create all necessary token files in `core/` and `platforms/`.

---

## 📱 Mobile App Migration

### Step 1: Wrap App with ThemeProvider

Update your `App.tsx`:

```typescript
// packages/mobile/App.tsx
import React from 'react';
import { ThemeProvider } from './src/theme/provider';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <ThemeProvider>
      <AppNavigator />
    </ThemeProvider>
  );
}
```

### Step 2: Update Component Imports

Replace old theme hook imports:

```typescript
// ❌ OLD
import { useThemeMobile } from '../../hooks/useTheme';
const { isDark, colors } = useThemeMobile();

// ✅ NEW
import { useTheme } from '../../hooks/useTheme';
const { theme, isDark } = useTheme();
```

### Step 3: Update Token References

Replace old token paths with new ones:

```typescript
// ❌ OLD
import { colors } from '@jarvi/shared';
backgroundColor: colors.brand.primary

// ✅ NEW
import { useTheme } from '../../hooks/useTheme';
const { theme } = useTheme();
backgroundColor: theme.semanticSurfaceSurfaceAccent
```

Or import static tokens:

```typescript
// ✅ NEW (static tokens)
import { spacing, colors } from '@jarvi/shared/src/design-tokens/platforms/native';
padding: spacing[4],
color: colors.gray50
```

---

## 🌐 Web App Migration

### Step 1: Remove Tailwind Classes

Replace Tailwind utility classes with CSS Modules:

```typescript
// ❌ OLD
<button className="bg-blue-500 text-white px-4 py-2 rounded">
  Click me
</button>

// ✅ NEW
import { Button } from '@/components/ui/Button';
<Button variant="primary" size="md">
  Click me
</Button>
```

### Step 2: Update Theme Hook

```typescript
// ❌ OLD
import { useThemeClasses } from '../../hooks/useTheme';
const { isDark } = useThemeClasses();

// ✅ NEW
import { useTheme } from '../../hooks/useTheme';
const { isDark, toggleTheme } = useTheme();
```

### Step 3: Use CSS Variables

For custom components, use CSS variables:

```css
/* ❌ OLD (Tailwind) */
.my-component {
  @apply bg-white dark:bg-gray-800 p-4 rounded-lg;
}

/* ✅ NEW (CSS Variables) */
.my-component {
  background-color: var(--semantic-surface-surface-primary);
  padding: var(--spacing-4);
  border-radius: var(--spacing-3);
}
```

---

## 🎨 Common Token Mappings

### Colors

| Old (Tailwind) | New (CSS Variables) | Native Token |
|----------------|---------------------|--------------|
| `bg-white` | `var(--semantic-surface-surface-primary)` | `theme.semanticSurfaceSurfacePrimary` |
| `bg-gray-800` | `var(--semantic-surface-surface-secondary)` | `theme.semanticSurfaceSurfaceSecondary` |
| `text-gray-900` | `var(--semantic-content-content-primary)` | `theme.semanticContentContentPrimary` |
| `text-gray-500` | `var(--semantic-content-content-secondary)` | `theme.semanticContentContentSecondary` |
| `border-gray-300` | `var(--semantic-borders-border-primary)` | `theme.semanticBordersBorderPrimary` |

### Spacing

| Old (Tailwind) | New (CSS Variables) | Native Token |
|----------------|---------------------|--------------|
| `p-4` | `padding: var(--spacing-4)` | `padding: spacing[4]` |
| `m-2` | `margin: var(--spacing-2)` | `margin: spacing[2]` |
| `gap-3` | `gap: var(--spacing-3)` | `gap: spacing[3]` |

### Border Radius

| Old (Tailwind) | New (CSS Variables) | Native Token |
|----------------|---------------------|--------------|
| `rounded-lg` | `border-radius: var(--spacing-3)` | `borderRadius: spacing[3]` |
| `rounded-md` | `border-radius: var(--spacing-2)` | `borderRadius: spacing[2]` |

---

## 🔧 Component Migration Examples

### Button Component

**Before:**
```typescript
<button className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg">
  Submit
</button>
```

**After (Web):**
```typescript
import { Button } from '@/components/ui/Button';
<Button variant="primary" size="md">
  Submit
</Button>
```

**After (Native):**
```typescript
import { Button } from '@/components/ui/Button';
<Button variant="primary" size="md" onPress={handleSubmit}>
  Submit
</Button>
```

### Card Component

**Before:**
```typescript
<div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md border border-gray-200">
  {children}
</div>
```

**After (Web):**
```typescript
import { Card } from '@/components/ui/Card';
<Card padding="md" shadow="md" rounded="lg">
  {children}
</Card>
```

**After (Native):**
```typescript
import { Card } from '@/components/ui/Card';
<Card padding="md">
  {children}
</Card>
```

### Input Component

**Before:**
```typescript
<input 
  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2"
  type="text"
  placeholder="Enter text..."
/>
```

**After (Web):**
```typescript
import { Input } from '@/components/ui/Input';
<Input 
  type="text"
  placeholder="Enter text..."
  label="Label"
/>
```

**After (Native):**
```typescript
import { Input } from '@/components/ui/Input';
<Input 
  type="text"
  placeholder="Enter text..."
  label="Label"
/>
```

---

## 🎯 Migration Checklist

### Shared Package
- [x] Generate tokens from Figma
- [x] Verify all token files exist in `core/` and `platforms/`
- [x] Test token generation scripts

### Web Package
- [ ] Remove Tailwind dependencies from package.json (optional - can keep for other uses)
- [x] Update PostCSS config
- [x] Create/update global styles
- [ ] Wrap app with theme provider (if not using class-based theming)
- [ ] Migrate components one by one
- [ ] Test dark mode switching
- [ ] Test all component variants

### Mobile Package
- [ ] Install `@react-native-async-storage/async-storage` if not already installed
- [ ] Wrap app with ThemeProvider
- [ ] Update imports in existing components
- [ ] Migrate components one by one
- [ ] Test theme persistence (AsyncStorage)
- [ ] Test system theme detection
- [ ] Test all component variants

---

## ⚠️ Breaking Changes

### Web
1. **Tailwind classes removed from core components**
   - Migrate to new component props or CSS Modules
   
2. **Theme hook interface changed**
   - `useThemeClasses()` → `useTheme()`
   
3. **Global styles import changed**
   - Import new `globals.css` instead of Tailwind base

### Native
1. **Theme hook interface changed**
   - `useThemeMobile()` → `useTheme()`
   - Theme structure is now flat (e.g., `theme.semanticSurfaceSurfacePrimary`)
   
2. **Token imports changed**
   - `@jarvi/shared` → `@jarvi/shared/src/design-tokens/platforms/native`

3. **ThemeProvider required**
   - Must wrap app with ThemeProvider

---

## 🐛 Troubleshooting

### Issue: CSS variables not defined

**Solution:** Make sure you're importing the global styles:
```typescript
// In main.tsx or App.tsx
import './styles/globals.css';
```

### Issue: Native tokens not found

**Solution:** Run token generation:
```bash
cd packages/shared
npm run tokens:generate
```

### Issue: Theme not persisting in Native

**Solution:** Make sure AsyncStorage is installed:
```bash
cd packages/mobile
npm install @react-native-async-storage/async-storage
```

### Issue: Dark mode not working

**Web Solution:** Verify the `.dark` class is being added to the root element
```typescript
const { theme } = useTheme();
// Should add/remove .dark class on <html>
```

**Native Solution:** Verify ThemeProvider is wrapping your app
```typescript
<ThemeProvider>
  <App />
</ThemeProvider>
```

---

## 📚 Additional Resources

- **Design Tokens README**: `packages/shared/src/design-tokens/README.md`
- **Implementation Summary**: `DESIGN_SYSTEM_SUMMARY.md`
- **Original Plan**: `.cursor/plans/multi-platform_design_system_*.plan.md`

---

## 💡 Tips

1. **Migrate incrementally**: Update one screen/component at a time
2. **Test both themes**: Always test light and dark modes
3. **Use type checking**: TypeScript will help catch token name errors
4. **Leverage autocomplete**: IDE autocomplete works with the new tokens
5. **Keep Figma as source of truth**: Never manually edit generated files

---

## 🆘 Need Help?

If you encounter issues:
1. Check the README files in the respective packages
2. Verify tokens are generated correctly
3. Check console for import errors
4. Review the examples in this guide
5. Compare with refactored components (Button, Card, Input)

