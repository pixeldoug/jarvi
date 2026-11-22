import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { onboardingApi } from '@/api/endpoints';
import { isGoogleSignInAvailable } from '@/auth/google';
import { GoogleButton } from '@/auth/google-button';
import { useLocale } from '@/i18n';
import {
  COUNTRY_DIALS,
  PHONE_PLACEHOLDER_KEYS,
  countryByIso,
  defaultCountryIso,
  formatNationalNumber,
  toE164,
  validateNationalNumber,
} from '@/lib/phone';
import { useTheme } from '@/theme/theme-provider';
import { radius, spacing } from '@/theme/tokens';
import { Button } from '@/ui/button';
import { EnvelopeSimpleIcon, XIcon } from '@/ui/icons';
import { LogoTile } from '@/ui/logo';
import { PillField } from '@/ui/pill-field';
import { Text } from '@/ui/text';
import { TextLink } from '@/ui/text-link';
import { AuthBackdrop, OrDivider } from './auth-backdrop';

interface WhatsAppEntryProps {
  /** Both send the same code (a new number creates the account); only the copy and links change. */
  mode: 'signIn' | 'signUp';
}

export function WhatsAppEntry({ mode }: WhatsAppEntryProps) {
  const { colors } = useTheme();
  const { t } = useTranslation(['auth', 'common']);
  const locale = useLocale();
  const [iso, setIso] = useState(() => defaultCountryIso(locale));
  const [national, setNational] = useState('');
  const [countryOpen, setCountryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const country = countryByIso(iso);
  const signIn = mode === 'signIn';

  const requestCode = async () => {
    const invalid = validateNationalNumber(national, iso);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setBusy(true);
    const phone = toE164(country.dial, national);
    try {
      const { devCode } = await onboardingApi.requestWhatsAppCode(phone);
      router.push({ pathname: '/codigo', params: { phone, devCode: devCode ?? '' } });
    } catch (err) {
      setError(errorMessage(err, t('whatsapp.errors.sendFailed')));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    if (signIn) router.push('/criar-conta');
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <AuthBackdrop>
      <View style={styles.header}>
        <LogoTile />
        <View style={styles.titles}>
          <Text variant="heading-lg">{signIn ? t('whatsapp.title') : t('signUp.title')}</Text>
          {signIn ? null : (
            <Text variant="body-md" color="contentSecondary">
              {t('signUp.subtitle')}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.form}>
        <View style={styles.phoneRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('whatsapp.countryButton', { iso: country.iso, dial: country.dial })}
            onPress={() => setCountryOpen((open) => !open)}
            style={({ pressed }) => [
              styles.countryPill,
              { backgroundColor: colors.surfaceSecondary, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <View style={styles.flag}>
              <Text variant="flag-fill">{country.flag}</Text>
            </View>
            <Text variant="body-lg">{`+${country.dial}`}</Text>
          </Pressable>
          <PillField
            containerStyle={styles.numberPill}
            error={!!error}
            value={formatNationalNumber(national, iso)}
            onChangeText={(text) => {
              setNational(text.replace(/\D/g, ''));
              if (error) setError(null);
            }}
            placeholder={t(PHONE_PLACEHOLDER_KEYS[country.iso])}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel-national"
            returnKeyType="send"
            onSubmitEditing={() => void requestCode()}
            accessibilityLabel={t('whatsapp.phoneLabel')}
            accessory={
              national ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('whatsapp.clear')}
                  onPress={() => setNational('')}
                  hitSlop={12}
                  style={[styles.clear, { backgroundColor: colors.contentTertiary }]}
                >
                  <XIcon size={12} color={colors.surfacePrimary} weight="bold" />
                </Pressable>
              ) : null
            }
          />
        </View>

        {countryOpen ? (
          <View style={[styles.countryList, { backgroundColor: colors.surfaceSecondary }]}>
            {COUNTRY_DIALS.map((option) => (
              <Pressable
                key={option.iso}
                accessibilityRole="button"
                accessibilityState={{ selected: option.iso === iso }}
                onPress={() => {
                  setIso(option.iso);
                  setCountryOpen(false);
                }}
                style={({ pressed }) => [styles.countryOption, pressed && { backgroundColor: colors.surfaceTertiary }]}
              >
                <Text variant="body-md">{`${option.flag}  ${option.iso}  +${option.dial}`}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {error ? (
          <Text variant="body-sm" color="contentNegative" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        <Button label={t('common:actions.continue')} onPress={() => void requestCode()} loading={busy} />
      </View>

      {/* Sign-up only offers Google, which Expo Go lacks: no divider over an empty block. */}
      {signIn || isGoogleSignInAvailable ? (
        <>
          <OrDivider label={t('divider.or')} />
          <View style={styles.others}>
            <GoogleButton />
            {signIn ? (
              <Button
                label={t('whatsapp.withEmail')}
                variant="outline"
                icon={<EnvelopeSimpleIcon size={18} color={colors.contentPrimary} />}
                onPress={() => router.push('/email')}
              />
            ) : null}
          </View>
        </>
      ) : null}

      <View style={styles.switchRow}>
        <Text variant="body-md" color="contentSecondary">
          {signIn ? t('signUp.prompt') : t('signIn.prompt')}
        </Text>
        <TextLink label={signIn ? t('signUp.link') : t('signIn.link')} onPress={switchMode} />
      </View>
    </AuthBackdrop>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xxl,
  },
  titles: {
    gap: spacing.sm,
  },
  form: {
    gap: spacing.lg,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  countryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderCurve: 'continuous',
  },
  flag: {
    width: 24,
    height: 24,
    borderRadius: radius.round,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberPill: {
    flex: 1,
  },
  clear: {
    width: 20,
    height: 20,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countryList: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  countryOption: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  others: {
    gap: spacing.md,
  },
  switchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
