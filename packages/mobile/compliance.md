# Mobile UI compliance

This is the **implementation contract** for `packages/mobile` (Expo / iOS / Android). It is not the Jarvi handbook — see [docs/README.md](../../docs/README.md).

## Do not import web overlay rules

Do **not** apply [packages/web/compliance.md](../web/compliance.md) web `Dialog` stacking rules here. Mobile overlays are navigation, sheets, and native modals — not the web `Dialog` primitive.

## Must

- **Tokens:** colors, type and radii come from `src/theme/tokens.ts`, which mirrors `packages/web/src/design-system/tokens`. Read them with `useTheme()`. No hex values in screens or components. Never use `@jarvi/shared` design tokens (they are stale).
- **Text:** render copy with `src/ui/text.tsx` (`variant` + `color`), not a bare `Text` with ad-hoc font styles.
- **Icons:** Phosphor icons, imported through `src/ui/icons.ts`. Add new ones there; never import from the `phosphor-react-native` root (it pulls every icon into the bundle).
- **Dark mode:** every surface must read from the theme. Check new screens in both schemes.
- **Modals:** a modal screen (`presentation: 'modal'`) carries its own `ModalHeader` (Cancelar / title / confirm). Inside it, choices expand inline under their row (see `features/tasks/task-form.tsx`); do not open a second sheet on top of a modal. Editors guard unsaved changes with `useConfirmDiscard` (covers swipe-down and Android back).
- **Keyboard:** use the views from `react-native-keyboard-controller` (`Screen` already does). React Native's `KeyboardAvoidingView` and `automaticallyAdjustKeyboardInsets` do not work on edge-to-edge Android.
- **"Today":** take the current day from `useToday()`, never `new Date()` during render (memoized rows and the React Compiler would keep yesterday).
- **Destructive actions** (delete task, sign out, delete account) confirm with a native `Alert` and use the `destructive` style. Deleting a task offers "Desfazer" in a toast.
- **Accessibility:** every `Pressable` has `accessibilityRole` and a label when its content is not plain text. Keep hit areas at least 44pt (use `hitSlop` on small icons).
- **Copy:** every visible string comes from the catalogs in pt-BR and en-US (see "Textos e idiomas" below). Short and direct ([docs/brand/README.md](../../docs/brand/README.md)). Errors from the API are shown with `errorMessage()`.

## Must not

- Edit `ios/` or `android/` by hand. Native config lives in `app.config.ts` and config plugins.
- Add a dependency with `npm install`. Use `npx expo install` so versions match the SDK.
- Call `fetch` for the backend directly. Use `src/api/client.ts` (session token, `X-Jarvi-Locale`, errors, sign-out on an expired session). The streamed chat is the one exception (`features/chat/use-chat-session.ts`): it must spread `localeHeaders()` into its headers and hand failures to `reportApiFailure()`.
- Send users to an external purchase flow from inside the app. How the app sells subscriptions is still undecided (App Store rules).

## Textos e idiomas (i18n)

Contract: [docs/decisions/0005-i18n.md](../../docs/decisions/0005-i18n.md). Languages: `pt-BR` (default, the source) and `en-US`. Setup and examples: `src/i18n/index.ts`.

- **No hard-coded text.** Every string a person sees or hears (labels, placeholders, `accessibilityLabel`/`accessibilityHint`, `Alert` titles and buttons, toasts, empty states) uses `t()` from `react-i18next` (`useTranslation('<ns>')`) or `i18n.t('<ns>:<key>')` from `@/i18n` outside React. Keys are typed: a typo or a key missing in pt-BR fails `tsc`.
- **Catalogs:** `src/locales/<locale>/<ns>.json`, namespaces `common, auth, onboarding, tasks, dates, notes, chat, settings, subscription, ui`. Shared words (Salvar, Cancelar, Hoje, generic errors, month/weekday names) live in `common`; reuse them instead of adding copies. A new key goes into **both** pt-BR and en-US in the same change. `npm run check:locales` must pass (key parity, `_one`/`_other` pairs, same `{{vars}}`, no empty values).
- **pt-BR is today's text.** Moving a string to the catalog never changes its Portuguese. en-US: natural, warm, direct US English; reuse the web's wording for the same concept (`packages/web/src/locales/en-US`).
- **No concatenation.** Whole sentences with `{{variables}}`; plurals with `key_one` / `key_other` and `count` (in pt-BR only `count === 1` is singular, 0 is plural). Never build a sentence from pieces or pick words with `=== 1 ?`.
- **Constants hold ids, not labels.** Module-level maps/arrays keep ids or keys; resolve the label with `t()` at render time (a label computed at import time never changes language).
- **Language switch with the React Compiler.** The compiler (`experiments.reactCompiler`) memoizes what a component computes from its inputs, so a call that reads the global language (`i18n.t`, `categoryLabel(name)`, `formatRecurrence(...)`) keeps its first result after Ajustes › Idioma until the app restarts. In components use `t()` / `useFormat()`; helpers outside React that return text take `options?: FormatOptions` and the component passes `{ locale }` from `useLocale()`. `npm run check:locales` checks the known helpers (`LOCALE_HELPERS`); add a new helper to that list.
- **Do not translate data or ids:** user content (task/note titles, category names), route segments (`ajustes`, `tarefa`, `nota`, `notificacoes`, `categorias`), note tab ids, enum values and the `users.name = 'Você'` sentinel. Only the label shown changes.
- **Dates, times, numbers, money, lists** go through `useFormat()` / `src/i18n/format.ts` (`formatDate` presets, `formatTime`, `formatRelativeDay`, `formatRelativeTime`, `formatList`, `formatNumber`, `formatCurrency`, `getWeekStartsOn`). Never write month/weekday names, "às", "há…" or `R$` in a screen, and never call `toLocaleDateString`. en-US shows 12h times ("9:00 AM") and weeks starting on Sunday; pt-BR keeps "09:00" and Monday.
- **Backend text:** the server answers `{ error, code }` with `error` already in the user's language. Branch on `code` (`ApiError#code`), never on the message; while the old backend is live, also accept its fixed strings (see `isSessionRejection` / `isSubscriptionRequired` in `src/api/client.ts`). The same goes for AI output the app parses (choice chips such as "Pick a date", "Pick a time", "Other", "No set time"; the "Próximos passos" / "Next steps" heading in note summaries): match the Portuguese and the English form.
- **Language order:** `user.locale` (server wins, applied by `AuthProvider`) → choice saved on this device → device language → pt-BR. Change it only with `changeLocale()` (saves on the account; 404 from an old backend is ignored).
- **Native strings** (iOS permission texts) live in `src/locales/native/<lang>.json`, wired through `locales` in `app.config.ts`.
- Check new screens in both languages (Ajustes › Idioma). English is often longer: let text wrap, never fix widths to Portuguese.

## When you change mobile UI

1. Read this file.
2. Follow patterns already in `packages/mobile`.
3. Run `npm run check` before calling it done.
