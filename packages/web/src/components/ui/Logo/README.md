# Logo Component

Brand logo component following JarviDS design system from Figma.

## Usage

```tsx
import { Logo } from '@/components/ui/Logo';

<Logo />

// With custom className
<Logo className="my-class" />
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `className` | `string` | `''` | Additional CSS classes |

## Design Specifications

From Figma (node-id: 40000180-1347):

- **Size**: 48x48px (fixed)
- **Border Radius**: 16px (`--radius-button-radius`)
- **Background**: `--component-logo-bg-default`
- **Shadow**: `0px 1px 0px rgba(24, 24, 27, 0.15)`
- **Icon Size**: 32x32px

## Examples

### In Header
```tsx
<header>
  <Logo />
  <nav>...</nav>
</header>
```

### With Title
```tsx
<div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
  <Logo />
  <div>
    <h3>Jarvi</h3>
    <p>Aplicativo de Produtividade</p>
  </div>
</div>
```















