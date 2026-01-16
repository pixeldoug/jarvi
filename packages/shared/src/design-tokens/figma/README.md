# Figma Tokens

This folder contains the raw design tokens exported from Figma using the **Figma Tokens Plugin**.

## Files

- `Default.tokens.json` - Primitive tokens (Colors, Typography, Sizes, Opacity)
- `Light.tokens.json` - Semantic tokens + Component-specific tokens for light mode
- `Dark.tokens.json` - Semantic tokens + Component-specific tokens for dark mode

## How to Update Tokens from Figma

1. Open your Figma design file
2. Open the Figma Tokens Plugin
3. Click "Export" and save the token files
4. Replace the corresponding files in this folder
5. Run the token generation scripts:
   ```bash
   cd packages/shared/src/design-tokens
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






















