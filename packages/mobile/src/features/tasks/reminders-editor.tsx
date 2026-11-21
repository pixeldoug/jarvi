import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useLocale } from '@/i18n';
import { addDays, toDateKey, toTimeString } from '@/lib/dates';
import {
  RELATIVE_REMINDER_PRESETS,
  createReminderId,
  formatReminderWithChannel,
  getChannelLabel,
  getPresetLabel,
  isSameReminder,
  type ConfiguredReminder,
} from '@/lib/reminders';
import { useTheme } from '@/theme/theme-provider';
import { spacing } from '@/theme/tokens';
import { Button } from '@/ui/button';
import { Chip } from '@/ui/chip';
import { DateTimeField } from '@/ui/date-time-field';
import { BellIcon, PhoneIcon, WhatsappLogoIcon, XIcon } from '@/ui/icons';
import { ListGroup, ListRow } from '@/ui/list-group';
import { Text } from '@/ui/text';
import type { ReminderChannel } from '@/types/reminder';

interface RemindersEditorProps {
  reminders: ConfiguredReminder[];
  /** Relative reminders count from the due time, so they need one. */
  hasTime: boolean;
  hasWhatsApp: boolean;
  onChange: (reminders: ConfiguredReminder[]) => void;
}

function defaultAbsolute(): Date {
  const tomorrow = addDays(new Date(), 1);
  return new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 9, 0);
}

export function RemindersEditor({ reminders, hasTime, hasWhatsApp, onChange }: RemindersEditorProps) {
  const { colors } = useTheme();
  const { t } = useTranslation(['dates', 'common']);
  const locale = useLocale();
  const [adding, setAdding] = useState(false);
  const [channel, setChannel] = useState<ReminderChannel>('whatsapp');
  const [presetId, setPresetId] = useState<string | null>(hasTime ? '15m-before' : null);
  const [at, setAt] = useState(defaultAbsolute);

  if (!hasWhatsApp) {
    return (
      <ListGroup title={t('reminders.title')} footer={t('reminders.linkWhatsAppHint')}>
        <ListRow
          label={t('reminders.title')}
          icon={<BellIcon size={18} color={colors.contentSecondary} />}
          value={t('reminders.unavailable')}
          last
        />
      </ListGroup>
    );
  }

  const add = () => {
    const preset = hasTime ? RELATIVE_REMINDER_PRESETS.find((p) => p.id === presetId) : undefined;
    const reminder: ConfiguredReminder = preset
      ? { id: createReminderId(), channel, type: 'relative', offset: preset.offset }
      : { id: createReminderId(), channel, type: 'absolute', scheduledAt: `${toDateKey(at)}T${toTimeString(at)}` };
    if (!reminders.some((existing) => isSameReminder(existing, reminder))) onChange([...reminders, reminder]);
    setAdding(false);
  };

  return (
    <ListGroup title={t('reminders.title')} footer={reminders.length === 0 && !adding ? t('reminders.emptyHint') : undefined}>
      {reminders.map((reminder) => (
        <ListRow
          key={reminder.id}
          label={formatReminderWithChannel(reminder, { locale })}
          icon={
            reminder.channel === 'call' ? (
              <PhoneIcon size={18} color={colors.contentSecondary} />
            ) : (
              <WhatsappLogoIcon size={18} color={colors.contentSecondary} />
            )
          }
          accessory={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('reminders.removeA11y', { label: formatReminderWithChannel(reminder, { locale }) })}
              hitSlop={10}
              onPress={() => onChange(reminders.filter((r) => r.id !== reminder.id))}
              style={styles.remove}
            >
              <XIcon size={16} color={colors.contentTertiary} />
            </Pressable>
          }
        />
      ))}

      {adding ? (
        <View style={[styles.adding, { backgroundColor: colors.surfaceGrouped }]}>
          <Text variant="label-sm" color="contentSecondary">
            {t('reminders.fields.how')}
          </Text>
          <View style={styles.chips}>
            {(['whatsapp', 'call'] as const).map((option) => (
              <Chip key={option} label={getChannelLabel(option, { locale })} selected={channel === option} onPress={() => setChannel(option)} />
            ))}
          </View>
          <Text variant="label-sm" color="contentSecondary">
            {t('reminders.fields.when')}
          </Text>
          {hasTime ? (
            <View style={styles.chips}>
              {RELATIVE_REMINDER_PRESETS.map((preset) => (
                <Chip key={preset.id} label={getPresetLabel(preset, { locale })} selected={presetId === preset.id} onPress={() => setPresetId(preset.id)} />
              ))}
              <Chip label={t('reminders.dateAndTime')} selected={presetId === null} onPress={() => setPresetId(null)} />
            </View>
          ) : null}
          {!hasTime || presetId === null ? (
            <View style={styles.pickerRow}>
              <DateTimeField mode="datetime" value={at} onChange={setAt} minimumDate={new Date()} accessibilityLabel={t('reminders.dateAndTimeA11y')} />
            </View>
          ) : null}
          <View style={styles.actions}>
            <Button label={t('common:actions.cancel')} variant="ghost" size="sm" onPress={() => setAdding(false)} />
            <Button label={t('common:actions.add')} size="sm" onPress={add} />
          </View>
        </View>
      ) : (
        <ListRow
          label={t('reminders.add')}
          icon={<BellIcon size={18} color={colors.contentInfo} />}
          onPress={() => {
            setPresetId(hasTime ? '15m-before' : null);
            setAt(defaultAbsolute());
            setAdding(true);
          }}
          last
        />
      )}
    </ListGroup>
  );
}

const styles = StyleSheet.create({
  remove: {
    padding: spacing.xs,
  },
  adding: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
