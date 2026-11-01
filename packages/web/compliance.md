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

## Segmented controls

To switch between a few views or sections (Semana / Mês, a note's Notas / Resumo / Transcrição), use **`SegmentedControl`** from `src/components/ui`. Do not build a bordered row of `Button`s with `active`, a custom tab bar, or a second pill style.

- `display="labels"` (default): every segment shows its label (+ optional icon).
- `display="compact"`: only the active segment shows its label; the others are icon-only with a tooltip. Every item needs an `icon`.
- `semantics="radio"` (default) for a view switch; `semantics="tabs"` when segments control tab panels (pass `id` + `panelId` per item and label the panel with the active `id`).

The active pill is taller than the track and slides between segments. The component reserves that overflow in its own box, so space it like any other element. Content that should move with the selection can reuse `SEGMENTED_CONTROL_TRANSITION`.

```tsx
/* ❌ BAD — hand-rolled switch */
<div className={styles.viewSwitch}>
  <Button variant="ghost" active={view === 'week'} onClick={() => setView('week')}>Semana</Button>
  <Button variant="ghost" active={view === 'month'} onClick={() => setView('month')}>Mês</Button>
</div>

/* ✅ GOOD */
<SegmentedControl
  items={[{ value: 'week', label: 'Semana' }, { value: 'month', label: 'Mês' }]}
  value={view}
  onChange={setView}
  aria-label="Alternar visualização"
/>
```

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

## Scrollbars

The app has **one** scrollbar, and the note page is the reference. It lives in `src/styles/globals.css` and reaches every scroll container on its own: 6px wide, transparent track, `--semantic-border-primary` pill thumb, `--semantic-content-secondary` on hover. To change the look, change `globals.css`, never one component.

- **Default:** give the container `overflow: auto` and nothing else. Do not write `::-webkit-scrollbar*` rules, `scrollbar-width: thin`, or `scrollbar-color` in a component. In Chromium those two properties replace the shared bar with the native one.
- **Panel body:** a scroll area that is a whole card's or panel's body (the main card's body, the note page, the sidebar, the calendar surfaces, the chat, the Settings canvas) composes the half-height variant. On desktop its track is inset by a quarter at each end, so the bar is half as tall and centered, as on the note page:

  ```css
  .body {
    composes: scrollbar-panel from global;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  ```

  The variant makes the area a size container (`container-type: size`), so its width and height must come from the layout (`flex: 1`, a fixed height, a stretched column), never from its content, or it collapses. If the area has vertical padding, set `--scrollbar-panel-padding-block` to its top + bottom padding, or the bar comes out taller than half. Lists inside menus, popovers, pickers, and inputs keep the default full-length bar.
- **By the card edge:** `MainLayout`'s scrolling body already bleeds over the card's right padding so its bar sits by the card's edge. A page that scrolls itself inside the card bleeds the same way (the note page's `.page`, the calendar's host in `Tasks.module.css`), using `--main-padding-x` / `--main-padding-top` and moving the same space back inside as padding, instead of leaving the bar inside the card's padding. The bar never touches an edge: a scroll area that reaches a card's or dialog's edge (the Settings canvas) stops 8px (`--sizes-2`) short of it. `Dialog` does this for its content on its own, reading `--dialog-padding-x`: a dialog that changes its side padding sets that variable too (`0px` when it has none) and insets its own scroller, and a scroller nested in the content bleeds with `--dialog-content-bleed`.
- **Hidden:** a horizontal strip that scrolls by swipe (chips, tabs, week nav) may hide its bar with `scrollbar-width: none;` plus `.strip::-webkit-scrollbar { display: none; }`. This is the only scrollbar rule allowed in a component.

```css
/* ❌ BAD — a second scrollbar */
.list { overflow-y: auto; scrollbar-width: thin; }
.list::-webkit-scrollbar { width: 4px; }
.list::-webkit-scrollbar-thumb { background: var(--semantic-surface-tertiary); }

/* ✅ GOOD — the shared one */
.list { overflow-y: auto; }
```

## Self-check

Scrollbars: `grep -rnE "webkit-scrollbar|scrollbar-(width|color)" packages/web/src --include='*.css'` should only list `globals.css` and hidden strips (`display: none` / `scrollbar-width: none`).

Nested dialogs are **runtime** state. Grep is a hint, not proof:

- A feature `Dialog` importing another `*Dialog` that also mounts `<Dialog isOpen={...}>` (as Settings does) is a likely violation.
- If UI already inside a `Dialog` opens another `isOpen` `Dialog`, it violates this file.
