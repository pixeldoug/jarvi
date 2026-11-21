import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/api/client';
import { onboardingApi } from '@/api/endpoints';
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
import { radius, spacing, typography } from '@/theme/tokens';
import { Button } from '@/ui/button';
import { CaretDownIcon } from '@/ui/icons';
import { Logo } from '@/ui/logo';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';

/** WhatsApp sign-in. A new number creates the account, so this is also sign-up. */
export default function WhatsAppSignInScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation('auth');
  const locale = useLocale();
  const [iso, setIso] = useState(() => defaultCountryIso(locale));
  const [national, setNational] = useState('');
  const [countryOpen, setCountryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const country = countryByIso(iso);

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

  return (
    <Screen
      scroll
      footer={
        <>
          <Button label={t('whatsapp.submit')} onPress={() => void requestCode()} loading={busy} />
          <GoogleButton />
          <Button label={t('whatsapp.withEmail')} variant="ghost" onPress={() => router.push('/email')} />
        </>
      }
    >
      <View style={styles.header}>
        <Logo size={44} />
        <Text variant="heading-lg">{t('whatsapp.title')}</Text>
        <Text variant="body-md" color="contentSecondary">
          {t('whatsapp.subtitle')}
        </Text>
      </View>

      <View style={styles.field}>
        <View
          style={[
            styles.phoneBar,
            { borderColor: error ? colors.contentNegative : colors.borderPrimary, backgroundColor: colors.surfacePrimary },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('whatsapp.countryButton', { iso: country.iso, dial: country.dial })}
            onPress={() => setCountryOpen((open) => !open)}
            style={styles.countryButton}
          >
            <Text variant="body-md">{`${country.flag} +${country.dial}`}</Text>
            <CaretDownIcon size={14} color={colors.contentSecondary} />
          </Pressable>
          <TextInput
            value={formatNationalNumber(national, iso)}
            onChangeText={(text) => {
              setNational(text.replace(/\D/g, ''));
              if (error) setError(null);
            }}
            placeholder={t(PHONE_PLACEHOLDER_KEYS[country.iso])}
            placeholderTextColor={colors.contentTertiary}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel-national"
            returnKeyType="send"
            onSubmitEditing={() => void requestCode()}
            accessibilityLabel={t('whatsapp.phoneLabel')}
            style={[typography['body-lg'], styles.phoneInput, { color: colors.contentPrimary }]}
          />
        </View>

        {countryOpen ? (
          <View style={[styles.countryList, { borderColor: colors.borderPrimary, backgroundColor: colors.surfacePrimary }]}>
            {COUNTRY_DIALS.map((option) => (
              <Pressable
                key={option.iso}
                accessibilityRole="button"
                accessibilityState={{ selected: option.iso === iso }}
                onPress={() => {
                  setIso(option.iso);
                  setCountryOpen(false);
                }}
                style={({ pressed }) => [styles.countryOption, pressed && { backgroundColor: colors.surfaceSecondary }]}
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
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.md,
    marginTop: spacing.xxl,
  },
  field: {
    gap: spacing.sm,
  },
  phoneBar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  countryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    alignSelf: 'stretch',
  },
  phoneInput: {
    flex: 1,
    paddingRight: spacing.lg,
    paddingVertical: spacing.md,
  },
  countryList: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  countryOption: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
