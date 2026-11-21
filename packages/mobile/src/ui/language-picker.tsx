import { useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { LOCALE_NATIVE_NAMES, SUPPORTED_LOCALES, changeLocale, useLocale, type Locale } from '@/i18n';
import { ListRow } from './list-group';
import { useToast } from './toast';

/**
 * "Idioma" / "Language" row for a `ListGroup` (Ajustes). Shows the current
 * language in its own name and, on press, lists every supported language in
 * its own name (so someone who cannot read the current one still finds
 * theirs). Picking one switches the app at once and saves it on the account
 * (`changeLocale`); if the account save fails the app keeps the new language
 * and a toast says it was not saved.
 *
 * The choice is a native Alert: Android shows at most 3 buttons, which fits
 * 2 languages + Cancel. A third language needs a sheet or a screen instead.
 */
export function LanguagePicker({ last = false }: { last?: boolean }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const select = async (next: Locale) => {
    if (next === locale) return;
    setSaving(true);
    try {
      await changeLocale(next);
      if (user) updateUser({ locale: next });
    } catch {
      toast({ message: t('language.changeError') });
    } finally {
      setSaving(false);
    }
  };

  const open = () =>
    Alert.alert(t('language.label'), undefined, [
      ...SUPPORTED_LOCALES.map((option) => ({
        text: option === locale ? `${LOCALE_NATIVE_NAMES[option]} ✓` : LOCALE_NATIVE_NAMES[option],
        onPress: () => void select(option),
      })),
      { text: t('actions.cancel'), style: 'cancel' as const },
    ]);

  return (
    <ListRow
      label={t('language.label')}
      value={LOCALE_NATIVE_NAMES[locale]}
      onPress={open}
      disabled={saving}
      last={last}
    />
  );
}
