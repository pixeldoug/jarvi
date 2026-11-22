/**
 * Translation catalogs, bundled with the app (no lazy loading, no backend).
 *
 * pt-BR is the source of truth. en-US must have exactly the same keys:
 * `enUS` is typed as `typeof ptBR`, so a key missing in en-US fails `tsc`,
 * and `npm run check:locales` also catches extra keys, plural pairs,
 * `{{variable}}` mismatches and empty values.
 *
 * Adding a namespace: create `src/locales/<locale>/<ns>.json` for every
 * locale, import both here, add it to `NAMESPACES`, `ptBR` and `enUS`.
 * (`src/locales/native/` is not a namespace: it holds the iOS InfoPlist
 * strings that app.config.ts `locales` points to.)
 */
import type { Locale } from './locale';

import ptBRAuth from '../locales/pt-BR/auth.json';
import ptBRChat from '../locales/pt-BR/chat.json';
import ptBRCommon from '../locales/pt-BR/common.json';
import ptBRDates from '../locales/pt-BR/dates.json';
import ptBRNotes from '../locales/pt-BR/notes.json';
import ptBROnboarding from '../locales/pt-BR/onboarding.json';
import ptBRSettings from '../locales/pt-BR/settings.json';
import ptBRSubscription from '../locales/pt-BR/subscription.json';
import ptBRTasks from '../locales/pt-BR/tasks.json';
import ptBRUi from '../locales/pt-BR/ui.json';

import enUSAuth from '../locales/en-US/auth.json';
import enUSChat from '../locales/en-US/chat.json';
import enUSCommon from '../locales/en-US/common.json';
import enUSDates from '../locales/en-US/dates.json';
import enUSNotes from '../locales/en-US/notes.json';
import enUSOnboarding from '../locales/en-US/onboarding.json';
import enUSSettings from '../locales/en-US/settings.json';
import enUSSubscription from '../locales/en-US/subscription.json';
import enUSTasks from '../locales/en-US/tasks.json';
import enUSUi from '../locales/en-US/ui.json';

export const NAMESPACES = [
  'common',
  'auth',
  'onboarding',
  'tasks',
  'dates',
  'notes',
  'chat',
  'settings',
  'subscription',
  'ui',
] as const;

export type Namespace = (typeof NAMESPACES)[number];

export const DEFAULT_NAMESPACE = 'common' satisfies Namespace;

/** Source catalog. Its shape types every `t()` key (see i18next.d.ts). */
export const ptBR = {
  common: ptBRCommon,
  auth: ptBRAuth,
  onboarding: ptBROnboarding,
  tasks: ptBRTasks,
  dates: ptBRDates,
  notes: ptBRNotes,
  chat: ptBRChat,
  settings: ptBRSettings,
  subscription: ptBRSubscription,
  ui: ptBRUi,
} satisfies Record<Namespace, object>;

/**
 * If tsc points here, en-US is missing keys that exist in pt-BR. Add them
 * to the en-US JSON (`npm run check:locales` lists every problem).
 */
export const enUS: typeof ptBR = {
  common: enUSCommon,
  auth: enUSAuth,
  onboarding: enUSOnboarding,
  tasks: enUSTasks,
  dates: enUSDates,
  notes: enUSNotes,
  chat: enUSChat,
  settings: enUSSettings,
  subscription: enUSSubscription,
  ui: enUSUi,
};

export const resources: Record<Locale, typeof ptBR> = {
  'pt-BR': ptBR,
  'en-US': enUS,
};
