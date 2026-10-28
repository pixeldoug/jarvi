import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from 'react-native';

import { errorMessage } from '@/api/client';
import { usersApi } from '@/api/endpoints';
import { Button } from '@/ui/button';
import { Screen } from '@/ui/screen';
import { LoadingState } from '@/ui/states';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';
import { useToast } from '@/ui/toast';

const memoryKey = ['memory'] as const;

function MemoryEditor({ initial }: { initial: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const { message } = await usersApi.setMemory(text.trim());
      queryClient.setQueryData(memoryKey, { memoryText: text.trim() });
      toast({ message: message || 'Memória atualizada.' });
    } catch (error) {
      Alert.alert('Não foi possível salvar', errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      grouped
      scroll
      edges={['bottom']}
      footer={<Button label="Salvar" onPress={() => void save()} loading={saving} disabled={text.trim() === initial.trim()} />}
    >
      <Text variant="body-md" color="contentSecondary">
        O que a Jarvi sabe sobre você para organizar melhor suas tarefas. Ela também aprende com as conversas.
      </Text>
      <TextField
        value={text}
        onChangeText={setText}
        multiline
        placeholder="Ex.: trabalho de casa às sextas, pago as contas no dia 10"
        accessibilityLabel="Memória da Jarvi"
        style={{ minHeight: 220 }}
      />
    </Screen>
  );
}

export default function MemoryScreen() {
  const memory = useQuery({ queryKey: memoryKey, queryFn: usersApi.memory });
  if (memory.isPending) return <LoadingState />;
  return <MemoryEditor initial={memory.data?.memoryText ?? ''} />;
}
