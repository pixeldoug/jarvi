# Handbook site

Internal VitePress view of the Jarvi handbook. Canonical Markdown lives in `docs/` and `packages/*/compliance.md`. VitePress reads `docs/` directly (it does not follow symlinks). Compliance pages are copied at startup into `docs/handbook-compliance/` (gitignored).

```bash
npm run dev:handbook
```
