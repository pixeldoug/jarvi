import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { usersApi, type NotificationEndpoint } from '@/api/endpoints';
import { timeToDate, toTimeString } from '@/lib/dates';
import { spacing } from '@/theme/tokens';
import { DateTimeField } from '@/ui/date-time-field';
import { ListGroup, ListRow } from '@/ui/list-group';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';
import { useToast } from '@/ui/toast';
import type { NotificationSetting } from '@/types/models';

interface NotificationCardProps {
  endpoint: NotificationEndpoint;
  name: string;
  description: string;
  defaultTime: string;
}

/** One WhatsApp message preference (web SettingsDialog › Notificações). */
function NotificationCard({ endpoint, name, description, defaultTime }: NotificationCardProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const key = ['notifications', endpoint];
  const query = useQuery({ queryKey: key, queryFn: () => usersApi.notification(endpoint) });
  const settings: NotificationSetting = query.data ?? { enabled: true, sendTime: defaultTime, timezone: '' };

  const save = useMutation({
    mutationFn: (patch: Partial<Pick<NotificationSetting, 'enabled' | 'sendTime'>>) => usersApi.setNotification(endpoint, patch),
    onMutate: (patch) => {
      const previous = queryClient.getQueryData<NotificationSetting>(key);
      queryClient.setQueryData(key, { ...settings, ...patch });
      return { previous };
    },
    onSuccess: (saved) => queryClient.setQueryData(key, saved),
    onError: (error, _patch, context) => {
      queryClient.setQueryData(key, context?.previous);
      toast({ message: errorMessage(error, `Não foi possível salvar ${name.toLowerCase()}.`) });
    },
  });

  return (
    <ListGroup title={name} footer={description}>
      <ListRow
        label="Ativado"
        switchValue={settings.enabled}
        onSwitchChange={(enabled) => save.mutate({ enabled })}
        disabled={query.isPending}
        last={!settings.enabled}
      />
      {settings.enabled ? (
        <ListRow
          label="Horário"
          accessory={
            <DateTimeField
              mode="time"
              value={timeToDate(settings.sendTime)}
              onChange={(date) => save.mutate({ sendTime: toTimeString(date) })}
              accessibilityLabel={`Horário do ${name.toLowerCase()}`}
            />
          }
          last
        />
      ) : null}
    </ListGroup>
  );
}

export default function NotificationsScreen() {
  return (
    <Screen grouped scroll edges={['bottom']}>
      <View style={styles.intro}>
        <Text variant="body-md" color="contentSecondary">
          Mensagens que a Jarvi manda no seu WhatsApp.
        </Text>
      </View>
      <NotificationCard
        endpoint="daily-summary"
        name="Resumo do dia"
        description="Todo dia, o que você tem para hoje."
        defaultTime="08:00"
      />
      <NotificationCard
        endpoint="weekly-planning"
        name="Planejamento semanal"
        description="Aos domingos, um plano para a semana."
        defaultTime="19:00"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    paddingHorizontal: spacing.lg,
  },
});
