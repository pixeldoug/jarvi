# Figma Tokens

This folder contains the raw design tokens exported from Figma using the **Figma Tokens Plugin**.

## Files

- `Default.tokens.json` - Primitive tokens (Colors, Typography, Sizes, Opacity)
- `desktop.tokens.json` - Sizing system for the desktop mode (Typography scale, Radius, Sizes). Emitted into `:root`.
- `mobile.tokens.json` - Sizing system for the mobile mode. Only the differing values (typography scale) are emitted into an `@media (max-width: 768px)` override.
- `Light.tokens.json` - Semantic tokens + Component-specific tokens for light mode
- `Dark.tokens.json` - Semantic tokens + Component-specific tokens for dark mode

> `desktop.tokens.json` and `mobile.tokens.json` are the two modes of the Figma "Mode" collection (formerly a single `Mode.tokens.json`). They share an identical schema; the generator diffs them and only the changed CSS variables are re-emitted inside the mobile media query, so the responsive scale cascades to web + marketing automatically.

## How to Update Tokens from Figma

1. Open your Figma design file
2. Open the Figma Tokens Plugin
3. Click "Export" and save the token files
4. Replace the corresponding files in this folder
5. Run the token generation scripts:
   ```bash
   cd packages/web
   npm run tokens:generate
   ```

## Workflow

```
Figma Design System      
    ↓ (Export via Figma Tokens Plugin)
figma/*.tokens.json
    ↓ (Parse and transform)
core/*.ts (TypeScript tokens)
    ↓ (Generate platform-specific)
platforms/web/*.css + platforms/native/*.ts
    ↓ (Import in components)
Web & Mobile Apps
```

## Important Notes

- **Never manually edit these JSON files** - they should only be updated from Figma
- Always commit token changes separately from code changes
- Test both light and dark themes after updating tokens





