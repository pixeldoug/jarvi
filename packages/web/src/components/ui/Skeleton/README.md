# Skeleton Component

Placeholder for content that is loading: a neutral surface (`--semantic-surface-secondary`) with a soft shimmer, static when the user prefers reduced motion. Use it where the content's shape is known (a summary, a list), so the layout does not jump when it arrives; use `Loading` (spinner) when it is not.

## Usage

```tsx
import { Skeleton, SkeletonText } from '../components/ui';

// One bar (text line) or a block
<Skeleton width="40%" />
<Skeleton shape="block" height={120} />

// A paragraph: lines sized to the text style
<SkeletonText lines={3} />
<SkeletonText variant="heading" lines={1} widths={['30%']} />
```

## Accessibility

Skeletons are decorative (`aria-hidden`). Wrap them in an element that announces the loading state:

```tsx
<div role="status" aria-label="Gerando resumo…">
  <SkeletonText lines={4} />
</div>
```
