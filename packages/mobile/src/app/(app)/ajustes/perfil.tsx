import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { errorMessage } from '@/api/client';
import { usersApi } from '@/api/endpoints';
import { useAuth, useCurrentUser } from '@/auth/auth-provider';
import { isPlaceholderName } from '@/features/onboarding/display-name';
import { Button } from '@/ui/button';
import { ListGroup, ListRow } from '@/ui/list-group';
import { Screen } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import { useToast } from '@/ui/toast';

function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export default function ProfileScreen() {
  const { t } = useTranslation(['settings', 'common']);
  const user = useCurrentUser();
  const { updateUser } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const timezone = useQuery({ queryKey: ['timezone'], queryFn: usersApi.timezone });
  // WhatsApp sign-ups keep the stored sentinel "Você"; show it in the UI language
  // ("You" in en-US) and send the sentinel back unless the person changes it.
  const placeholder = isPlaceholderName(user.name);
  const shownName = placeholder ? t('common:user.you') : user.name;
  const [name, setName] = useState(shownName);
  const [preferredName, setPreferredName] = useState(user.preferred_name ?? '');
  const [saving, setSaving] = useState(false);
  const dirty = name.trim() !== shownName || preferredName.trim() !== (user.preferred_name ?? '');

  const save = async () => {
    if (!name.trim()) {
      Alert.alert(t('profile.nameRequired'));
      return;
    }
    const nextName = placeholder && name.trim() === shownName ? user.name : name.trim();
    setSaving(true);
    try {
      await usersApi.updateProfile({ name: nextName, preferred_name: preferredName.trim() });
      updateUser({ name: nextName, preferred_name: preferredName.trim() || null });
      toast({ message: t('profile.saved') });
      router.back();
    } catch (error) {
      Alert.alert(t('profile.saveError'), errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const syncTimezone = async () => {
    try {
      const { timezone: saved } = await usersApi.setTimezone(deviceTimezone());
      queryClient.setQueryData(['timezone'], { timezone: saved });
      toast({ message: t('profile.timezone.updated', { timezone: saved }) });
    } catch (error) {
      Alert.alert(t('profile.timezone.updateError'), errorMessage(error));
    }
  };

  const current = timezone.data?.timezone;
  const device = deviceTimezone();

  return (
    <Screen grouped scroll edges={['bottom']} footer={<Button label={t('common:actions.save')} onPress={() => void save()} loading={saving} disabled={!dirty} />}>
      <TextField label={t('profile.nameLabel')} value={name} onChangeText={setName} autoCapitalize="words" textContentType="name" />
      <TextField
        label={t('profile.preferredNameLabel')}
        value={preferredName}
        onChangeText={setPreferredName}
        placeholder={t('profile.preferredNamePlaceholder')}
        autoCapitalize="words"
      />
      <ListGroup title={t('profile.timezone.title')} footer={t('profile.timezone.footer')}>
        <ListRow label={t('profile.timezone.current')} value={current ?? t('profile.timezone.loading')} last={current === device} />
        {current && current !== device ? (
          <ListRow label={t('profile.timezone.useDevice', { timezone: device })} onPress={() => void syncTimezone()} last />
        ) : null}
      </ListGroup>
    </Screen>
  );
}
