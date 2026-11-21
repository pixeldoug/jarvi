import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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

/** Which card; picks its texts under `settings:notifications.<kind>`. */
type NotificationKind = 'daily' | 'weekly';

interface NotificationCardProps {
  endpoint: NotificationEndpoint;
  kind: NotificationKind;
  defaultTime: string;
}

/** One WhatsApp message preference (web SettingsDialog › Notificações). */
function NotificationCard({ endpoint, kind, defaultTime }: NotificationCardProps) {
  const { t } = useTranslation('settings');
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
      toast({ message: errorMessage(error, t(`notifications.${kind}.saveError`)) });
    },
  });

  return (
    <ListGroup title={t(`notifications.${kind}.name`)} footer={t(`notifications.${kind}.description`)}>
      <ListRow
        label={t('notifications.enabled')}
        switchValue={settings.enabled}
        onSwitchChange={(enabled) => save.mutate({ enabled })}
        disabled={query.isPending}
        last={!settings.enabled}
      />
      {settings.enabled ? (
        <ListRow
          label={t('notifications.time')}
          accessory={
            <DateTimeField
              mode="time"
              value={timeToDate(settings.sendTime)}
              onChange={(date) => save.mutate({ sendTime: toTimeString(date) })}
              accessibilityLabel={t(`notifications.${kind}.timeLabel`)}
            />
          }
          last
        />
      ) : null}
    </ListGroup>
  );
}

export default function NotificationsScreen() {
  const { t } = useTranslation('settings');
  return (
    <Screen grouped scroll edges={['bottom']}>
      <View style={styles.intro}>
        <Text variant="body-md" color="contentSecondary">
          {t('notifications.intro')}
        </Text>
      </View>
      <NotificationCard endpoint="daily-summary" kind="daily" defaultTime="08:00" />
      <NotificationCard endpoint="weekly-planning" kind="weekly" defaultTime="19:00" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    paddingHorizontal: spacing.lg,
  },
});
