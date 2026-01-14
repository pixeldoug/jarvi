# Divider Component

Simple divider component matching Figma design specifications.

## Usage

```tsx
import { Divider } from '../components/ui';

// Horizontal divider (default)
<Divider />

// Vertical divider
<Divider orientation="vertical" />

// With custom spacing
<Divider className="my-8" />
```

## Examples

### In a list

```tsx
<div>
  <div>Item 1</div>
  <Divider />
  <div>Item 2</div>
  <Divider />
  <div>Item 3</div>
</div>
```

### In a card

```tsx
<Card>
  <h3>Card Title</h3>
  <Divider />
  <p>Card content goes here.</p>
  <Divider />
  <div>Actions</div>
</Card>
```

### Vertical divider

```tsx
<div style={{ display: 'flex', gap: '16px' }}>
  <span>Left content</span>
  <Divider orientation="vertical" />
  <span>Right content</span>
</div>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | Orientation of the divider |
| `className` | `string` | `''` | Additional CSS classes |

## Design Tokens

- **Color**: `--semantic-border-primary` (#D8DDE0 in light mode, #34373C in dark mode)
- **Height/Width**: 0.5px (as specified in Figma)

## Accessibility

- Uses semantic `<hr>` element
- Includes `role="separator"`
- Includes `aria-orientation` attribute

## Storybook

View all variants and examples in Storybook:

```bash
npm run storybook
```

Navigate to: **Components → Divider**
