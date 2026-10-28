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
- **Copy:** PT-BR, short and direct ([docs/brand/README.md](../../docs/brand/README.md)). Errors from the API are shown with `errorMessage()`.

## Must not

- Edit `ios/` or `android/` by hand. Native config lives in `app.config.ts` and config plugins.
- Add a dependency with `npm install`. Use `npx expo install` so versions match the SDK.
- Call `fetch` for the backend directly. Use `src/api/client.ts` (session token, errors, sign-out on an expired session). The streamed chat is the one exception (`features/chat/chat-provider.tsx`).
- Send users to an external purchase flow from inside the app. How the app sells subscriptions is still undecided (App Store rules).

## When you change mobile UI

1. Read this file.
2. Follow patterns already in `packages/mobile`.
3. Run `npm run check` before calling it done.
