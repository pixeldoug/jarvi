# Web UI compliance

Handbook: [docs/README.md](../../docs/README.md). Token doctrine: [src/design-system/README.md](src/design-system/README.md). Why one overlay: [docs/decisions/0001-one-overlay.md](../../docs/decisions/0001-one-overlay.md).

This file is the **contract** for `packages/web`. Read it before changing web UI. Do not copy these bans to marketing or mobile.

## Banned

### Nested Dialog overlays

Never render a `Dialog` while another `Dialog` is already open (two overlays, two backdrops).

Settings profile flows use **replace**: close Minha Conta (or the mobile sheet), open the child, reopen the parent on child close. See `Sidebar` + `ProfilePage` (`password`, `disconnect`, `delete`).

## Instead

Pick one:

1. **Replace:** close the parent, open the child. On child close, reopen the parent if needed.
2. **Same dialog:** swap the content of the open `Dialog` (view/step). No second overlay.

Do not invent a second portal or nested `createPortal` to stack on purpose.

## Component map

UI primitives live in `src/components/ui/` (see `src/components/ui/index.ts`). Import those. Do not fork Button, Dialog, TextInput, or other primitives in feature folders.

## Self-check

Nested dialogs are **runtime** state. Grep is a hint, not proof:

- A feature `Dialog` importing another `*Dialog` that also mounts `<Dialog isOpen={...}>` (as Settings does) is a likely violation.
- If UI already inside a `Dialog` opens another `isOpen` `Dialog`, it violates this file.
