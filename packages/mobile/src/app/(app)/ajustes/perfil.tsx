import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { errorMessage } from '@/api/client';
import { usersApi } from '@/api/endpoints';
import { useAuth, useCurrentUser } from '@/auth/auth-provider';
import { Button } from '@/ui/button';
import { ListGroup, ListRow } from '@/ui/list-group';
import { Screen } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import { useToast } from '@/ui/toast';

function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export default function ProfileScreen() {
  const user = useCurrentUser();
  const { updateUser } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const timezone = useQuery({ queryKey: ['timezone'], queryFn: usersApi.timezone });
  const [name, setName] = useState(user.name);
  const [preferredName, setPreferredName] = useState(user.preferred_name ?? '');
  const [saving, setSaving] = useState(false);
  const dirty = name.trim() !== user.name || preferredName.trim() !== (user.preferred_name ?? '');

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('Informe seu nome');
      return;
    }
    setSaving(true);
    try {
      await usersApi.updateProfile({ name: name.trim(), preferred_name: preferredName.trim() });
      updateUser({ name: name.trim(), preferred_name: preferredName.trim() || null });
      toast({ message: 'Perfil atualizado.' });
      router.back();
    } catch (error) {
      Alert.alert('Não foi possível salvar', errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const syncTimezone = async () => {
    try {
      const { timezone: saved } = await usersApi.setTimezone(deviceTimezone());
      queryClient.setQueryData(['timezone'], { timezone: saved });
      toast({ message: `Fuso horário: ${saved}.` });
    } catch (error) {
      Alert.alert('Não foi possível atualizar o fuso', errorMessage(error));
    }
  };

  const current = timezone.data?.timezone;
  const device = deviceTimezone();

  return (
    <Screen grouped scroll edges={['bottom']} footer={<Button label="Salvar" onPress={() => void save()} loading={saving} disabled={!dirty} />}>
      <TextField label="Nome" value={name} onChangeText={setName} autoCapitalize="words" textContentType="name" />
      <TextField
        label="Como a Jarvi te chama"
        value={preferredName}
        onChangeText={setPreferredName}
        placeholder="Apelido (opcional)"
        autoCapitalize="words"
      />
      <ListGroup
        title="Fuso horário"
        footer="Lembretes e resumos seguem este fuso."
      >
        <ListRow label="Atual" value={current ?? '…'} last={current === device} />
        {current && current !== device ? (
          <ListRow label={`Usar ${device}`} onPress={() => void syncTimezone()} last />
        ) : null}
      </ListGroup>
    </Screen>
  );
}
