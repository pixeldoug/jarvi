# Marketing UI compliance

This is the **implementation contract** for `packages/marketing` (Next.js public site). It is not the Jarvi handbook — see [docs/README.md](../../docs/README.md).

## Status

No surface-specific bans yet. When the first must/must-not exists (layout, SEO chrome, marketing components), add it **here**.

## Do not import web overlay rules

Do **not** apply [packages/web/compliance.md](../web/compliance.md) Dialog stacking rules to this package. Marketing is a different surface (pages, not the logged-in app `Dialog`).

## When you change marketing UI

1. Read this file.
2. Reuse existing marketing components and styles in this package.
3. Product voice: [docs/brand/README.md](../../docs/brand/README.md).
