/**
 * Types every `t()` key against the pt-BR catalogs (the source of truth).
 *
 *   t('actions.save')                          // common (default namespace)
 *   useTranslation('tasks').t('toast.created') // another namespace
 *   i18n.t('tasks:toast.created')              // `ns:key` outside React
 *
 * A typo, or a key that only exists in en-US, is a compile error.
 */
import 'i18next';

import type { ptBR } from './resources';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: typeof ptBR;
    returnNull: false;
  }
}
