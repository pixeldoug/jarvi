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

UI primitives live in `src/components/ui/` (see `src/components/ui/index.ts`). Import those. Do not fork Button, Dialog, TextInput, `ListCard`, or other primitives in feature folders.

## Banned: red hover on row delete icons

A trash / remove control on a list or composer **row** is a quiet affordance, not a destructive CTA. Do not turn it red (or pink) on hover, and do not pair it with a red or tinted circular hit area.

That includes `color: var(--semantic-content-negative)`, `--color-system-red-*`, `hover:text-red-*`, and any hover that paints the glyph or its chip as error/danger.

Match `CategoryRow` / `TaskItem` action buttons: same secondary/primary content color as edit or other row actions; hover only lifts the background to `var(--semantic-surface-secondary)` (or the secondary button hover token). The icon may go slightly darker (`--semantic-content-primary`), never red.

Use `Button variant="destructive"` only on an explicit confirm action (delete account, confirm delete list). Not on a hover-revealed trash in a task row.

Reference: `CategoryRow.module.css` (`.actionBtn:hover`), `TaskItem.module.css` (`.actionButton:hover`).

## Banned: invented buttons

Use `Button` from `src/components/ui`. Variants are only **primary**, **secondary**, **ghost**, and **destructive**. Sizes are only **small** and **medium**.

Do not invent a fifth look: red text on a secondary, outline-danger, purple ghost, pill CTA, or `className` that restyles a `Button` into a new variant (`!important` color, negative content on secondary, new radius/height).

```tsx
/* ❌ BAD — fake “remove” variant */
<Button variant="secondary" className={styles.removeButton}>Remover</Button>

/* ✅ GOOD — real DS buttons */
<Button variant="secondary" size="small">Remover</Button>
<Button variant="destructive">Deletar Conta</Button>
```

`destructive` is only for an explicit confirm (delete account, confirm delete). Row “Remover” / “Desconectar” that opens a confirm uses **secondary**.

Google sign-in uses `GoogleLogin`. Upgrade uses `UpgradeButton`. Do not fork either.

## Stacked list cards

When the user asks for a **card** that is one item in a list (settings, apps, login methods, integrations, or any “icon + name + helper + action” row), use **`ListCard`** + **`ListCardGroup`** from `src/components/ui`. Reference: Apps.

This is the default card list. Do not invent a one-card-with-dividers layout, a custom surface, or a new row chrome.

Anatomy:

1. Icon tile
2. Title (item name only)
3. Description (value or helper — e.g. `Conectado em +55 …`)
4. Trailing action (`Button`, `Switch`, `ConnectionChip`, …)

If the description already says the item is connected (`Conectado em …`), do **not** also show `ConnectionChip`. Linked: **`Button variant="ghost" size="small"` icon-only** (`DotsThreeVertical`) → **`Dropdown`** of **`ListItem`s without icons** (Alterar senha, Desconectar, Gerenciar). Not linked: **`Button variant="secondary" size="small"`**. Do not put a status pill under the title. Do not put Remover on the list row. Do not invent a green Badge, a filled Chip, or a custom `.status` span.

`ConnectionChip` is only for lists where the description is *not* the connection status (e.g. Apps, where the chip is the trailing action).

```tsx
/* ❌ BAD */
<p>Email {address}</p>
<span className={styles.status}>Conectado</span>
<Button variant="secondary">Remover</Button>

/* ✅ GOOD */
<ListCard
  icon={icon}
  title="Email"
  description={`Conectado em ${address}.`}
  action={
    <Button
      variant="ghost"
      size="small"
      icon={DotsThreeVertical}
      iconPosition="icon-only"
      aria-label="Mais opções"
    />
  }
/>
```

Do **not** use `ListCard` for task rows (`TaskItem`), sidebar (`ListItem` / `CategoryRow`), chat task cards, or `WhatsNewCard`.

`Chip` and `Badge` stay for filters / tags. They have no success variant — do not fake one. `ConnectionChip` is only the green “Conectado” pill.

## Banned: pill radius on text inputs

Never give a text field, textarea, search box, composer, OTP cell, or their visual wrapper `border-radius: 9999px`, `999px`, or `var(--radius-round)` unless the user **explicitly** asks for a pill / capsule input.

Default field radius is `var(--radius-sm)` (12px), as on `TextInput` / `PasswordInput` / `TextArea` / `OtpInput`. `--radius-md` or `--radius-lg` is fine when matching a nearby surface. `--radius-round` stays valid for chips, switches, avatars, and scrollbar thumbs — not for typing fields.

## Self-check

Nested dialogs are **runtime** state. Grep is a hint, not proof:

- A feature `Dialog` importing another `*Dialog` that also mounts `<Dialog isOpen={...}>` (as Settings does) is a likely violation.
- If UI already inside a `Dialog` opens another `isOpen` `Dialog`, it violates this file.
