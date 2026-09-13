/**
 * NotificationsPage - SettingsDialog
 *
 * "Notificações" tab: proactive messages Jarvi sends on WhatsApp.
 * Two settings, each with an on/off switch and, when on, the send time:
 *
 *   - Resumo do dia          → every day (default 08:00)
 *   - Planejamento semanal   → every Sunday (default 19:00)
 *
 * The timezone comes from the profile setting and is only displayed here.
 * The backend decides what goes into each message and when it is sent; this
 * page only edits the preferences. Both endpoints share the same shape, so
 * one hook (`useNotificationSetting`) drives both cards.
 */

import { useEffect, useMemo, useState } from 'react';
import { Button, ListCard, ListCardGroup, Select, Switch, toast } from '../../../../ui';
import type { SelectOption } from '../../../../ui';
import { useAuth } from '../../../../../contexts/AuthContext';
import shared from '../SettingsDialog.module.css';
import styles from './NotificationsPage.module.css';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

interface NotificationSettings {
  enabled: boolean;
  sendTime: string;
  timezone: string;
}

type NotificationPatch = Partial<Pick<NotificationSettings, 'enabled' | 'sendTime'>>;

interface NotificationLabels {
  /** Used in toasts and error messages ("Resumo do dia"). */
  name: string;
  loadError: string;
  saveError: string;
}

/** 00:00 … 23:30 in 30-minute steps. */
const TIME_OPTIONS: SelectOption[] = Array.from({ length: 48 }, (_, i) => {
  const hh = String(Math.floor(i / 2)).padStart(2, '0');
  const mm = i % 2 === 0 ? '00' : '30';
  return { value: `${hh}:${mm}`, label: `${hh}:${mm}` };
});

/** Make sure a value set elsewhere (e.g. 07:15 via API/agent) is still selectable. */
const optionsIncluding = (sendTime: string): SelectOption[] => {
  if (TIME_OPTIONS.some((o) => o.value === sendTime)) return TIME_OPTIONS;
  return [...TIME_OPTIONS, { value: sendTime, label: sendTime }].sort((a, b) => a.value.localeCompare(b.value));
};

/**
 * Fetch + optimistic save for one `/api/users/<endpoint>` notification
 * preference. Both Resumo do dia and Planejamento semanal use it.
 */
function useNotificationSetting(endpoint: string, defaultSendTime: string, labels: NotificationLabels) {
  const { token } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings>({
    enabled: true,
    sendTime: defaultSendTime,
    timezone: 'America/Sao_Paulo',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    fetch(`${API_URL}/api/users/${endpoint}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(labels.loadError);
        return (await res.json()) as NotificationSettings;
      })
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch(() => {
        // Keep the defaults; the switch still reflects the opt-out nature.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, endpoint, labels.loadError]);

  const timeOptions = useMemo(() => optionsIncluding(settings.sendTime), [settings.sendTime]);

  const save = async (patch: NotificationPatch) => {
    const previous = settings;
    setSettings((s) => ({ ...s, ...patch }));
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/users/${endpoint}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(patch),
      });
      const data = (await response.json()) as Partial<NotificationSettings> & { error?: string };
      if (!response.ok) throw new Error(data.error || labels.saveError);
      setSettings((s) => ({
        ...s,
        enabled: typeof data.enabled === 'boolean' ? data.enabled : s.enabled,
        sendTime: typeof data.sendTime === 'string' ? data.sendTime : s.sendTime,
        timezone: typeof data.timezone === 'string' ? data.timezone : s.timezone,
      }));
      if (patch.enabled !== undefined) {
        toast.success(patch.enabled ? `${labels.name} ativado.` : `${labels.name} desativado.`);
      } else if (patch.sendTime !== undefined) {
        toast.success(`${labels.name} às ${patch.sendTime}.`);
      }
    } catch (error) {
      setSettings(previous);
      toast.error(error instanceof Error ? error.message : labels.saveError);
    } finally {
      setSaving(false);
    }
  };

  return { settings, loading, saving, timeOptions, save };
}

const DAILY_LABELS: NotificationLabels = {
  name: 'Resumo do dia',
  loadError: 'Erro ao carregar o Resumo do Dia',
  saveError: 'Erro ao salvar o Resumo do Dia',
};

const WEEKLY_LABELS: NotificationLabels = {
  name: 'Planejamento semanal',
  loadError: 'Erro ao carregar o Planejamento Semanal',
  saveError: 'Erro ao salvar o Planejamento Semanal',
};

const whatsappIcon = <img src="/icons/apps/whatsapp.svg" alt="" draggable={false} />;

export function NotificationsPage({ onGoToApps }: { onGoToApps?: () => void }) {
  const { user } = useAuth();
  const whatsappLinked = Boolean(user?.whatsappVerified);

  const daily = useNotificationSetting('daily-summary', '08:00', DAILY_LABELS);
  const weekly = useNotificationSetting('weekly-planning', '19:00', WEEKLY_LABELS);

  const anyEnabled = daily.settings.enabled || weekly.settings.enabled;

  return (
    <div className={shared.section}>
      <ListCardGroup>
        <ListCard
          as="li"
          icon={whatsappIcon}
          title="Resumo do dia"
          description="Receba no WhatsApp suas tarefas e lembretes do dia."
          action={
            <Switch
              checked={daily.settings.enabled}
              onChange={(checked) => void daily.save({ enabled: checked })}
              disabled={daily.loading || daily.saving}
              aria-label="Ativar Resumo do dia"
            />
          }
        />
        <ListCard
          as="li"
          icon={whatsappIcon}
          title="Planejamento semanal"
          description="Todo domingo, no WhatsApp, para você contar o que precisa resolver na semana."
          action={
            <Switch
              checked={weekly.settings.enabled}
              onChange={(checked) => void weekly.save({ enabled: checked })}
              disabled={weekly.loading || weekly.saving}
              aria-label="Ativar Planejamento semanal"
            />
          }
        />
      </ListCardGroup>

      {daily.settings.enabled && (
        <div className={shared.fieldGroup}>
          <Select
            id="settings-daily-summary-time"
            label="Horário do Resumo do dia"
            options={daily.timeOptions}
            value={daily.settings.sendTime}
            onChange={(e) => void daily.save({ sendTime: e.target.value })}
            disabled={daily.loading || daily.saving}
            helperText={`No seu fuso horário (${daily.settings.timezone}). Só enviamos quando há algo para hoje.`}
          />
        </div>
      )}

      {weekly.settings.enabled && (
        <div className={shared.fieldGroup}>
          <Select
            id="settings-weekly-planning-time"
            label="Horário do Planejamento semanal"
            options={weekly.timeOptions}
            value={weekly.settings.sendTime}
            onChange={(e) => void weekly.save({ sendTime: e.target.value })}
            disabled={weekly.loading || weekly.saving}
            helperText={`Aos domingos, no seu fuso horário (${weekly.settings.timezone}).`}
          />
        </div>
      )}

      {anyEnabled && !whatsappLinked && (
        <div className={styles.notice}>
          <p className={shared.sectionDescription}>
            Conecte seu WhatsApp para receber essas mensagens.
          </p>
          {onGoToApps && (
            <Button variant="secondary" size="small" onClick={onGoToApps}>
              Conectar WhatsApp
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
