# Mobile UI compliance

This is the **implementation contract** for `packages/mobile` (Expo / iOS / Android). It is not the Jarvi handbook — see [docs/README.md](../../docs/README.md).

## Status

No surface-specific bans yet. When the first must/must-not exists (native navigation, sheets, stacks), add it **here**.

## Do not import web overlay rules

Do **not** apply [packages/web/compliance.md](../web/compliance.md) web `Dialog` stacking rules here. Mobile overlays are navigation, sheets, and native modals — not the web `Dialog` primitive.

## When you change mobile UI

1. Read this file.
2. Follow patterns already in `packages/mobile`.
3. Product voice: [docs/brand/README.md](../../docs/brand/README.md).
