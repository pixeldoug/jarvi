/**
 * NotificationsPage - SettingsDialog
 *
 * "Notificações" tab: proactive messages Jarvi sends on WhatsApp.
 * Today it holds one setting — Resumo do Dia (daily summary) — with an
 * on/off switch and, when on, the send time. The timezone comes from the
 * profile setting and is only displayed here.
 *
 * The backend decides what goes into the summary and when it is sent; this
 * page only edits the two preferences.
 */

import { useEffect, useMemo, useState } from 'react';
import { Button, ListCard, ListCardGroup, Select, Switch, toast } from '../../../../ui';
import type { SelectOption } from '../../../../ui';
import { useAuth } from '../../../../../contexts/AuthContext';
import shared from '../SettingsDialog.module.css';
import styles from './NotificationsPage.module.css';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const DEFAULT_SEND_TIME = '08:00';

interface DailySummarySettings {
  enabled: boolean;
  sendTime: string;
  timezone: string;
}

/** 00:00 … 23:30 in 30-minute steps. */
const TIME_OPTIONS: SelectOption[] = Array.from({ length: 48 }, (_, i) => {
  const hh = String(Math.floor(i / 2)).padStart(2, '0');
  const mm = i % 2 === 0 ? '00' : '30';
  return { value: `${hh}:${mm}`, label: `${hh}:${mm}` };
});

export function NotificationsPage({ onGoToApps }: { onGoToApps?: () => void }) {
  const { token, user } = useAuth();
  const whatsappLinked = Boolean(user?.whatsappVerified);

  const [settings, setSettings] = useState<DailySummarySettings>({
    enabled: true,
    sendTime: DEFAULT_SEND_TIME,
    timezone: 'America/Sao_Paulo',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    fetch(`${API_URL}/api/users/daily-summary`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Erro ao carregar o Resumo do Dia');
        return (await res.json()) as DailySummarySettings;
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
  }, [token]);

  // Make sure a value set elsewhere (e.g. 07:15 via API) is still selectable.
  const timeOptions = useMemo<SelectOption[]>(() => {
    if (TIME_OPTIONS.some((o) => o.value === settings.sendTime)) return TIME_OPTIONS;
    return [...TIME_OPTIONS, { value: settings.sendTime, label: settings.sendTime }].sort((a, b) =>
      a.value.localeCompare(b.value),
    );
  }, [settings.sendTime]);

  const save = async (patch: Partial<Pick<DailySummarySettings, 'enabled' | 'sendTime'>>) => {
    const previous = settings;
    setSettings((s) => ({ ...s, ...patch }));
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/users/daily-summary`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(patch),
      });
      const data = (await response.json()) as Partial<DailySummarySettings> & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Erro ao salvar o Resumo do Dia');
      setSettings((s) => ({
        ...s,
        enabled: typeof data.enabled === 'boolean' ? data.enabled : s.enabled,
        sendTime: typeof data.sendTime === 'string' ? data.sendTime : s.sendTime,
        timezone: typeof data.timezone === 'string' ? data.timezone : s.timezone,
      }));
      if (patch.enabled !== undefined) {
        toast.success(patch.enabled ? 'Resumo do dia ativado.' : 'Resumo do dia desativado.');
      } else if (patch.sendTime !== undefined) {
        toast.success(`Resumo do dia às ${patch.sendTime}.`);
      }
    } catch (error) {
      setSettings(previous);
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar o Resumo do Dia');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={shared.section}>
      <ListCardGroup>
        <ListCard
          as="li"
          icon={<img src="/icons/apps/whatsapp.svg" alt="" draggable={false} />}
          title="Resumo do dia"
          description="Receba no WhatsApp suas tarefas e lembretes do dia."
          action={
            <Switch
              checked={settings.enabled}
              onChange={(checked) => void save({ enabled: checked })}
              disabled={loading || saving}
              aria-label="Ativar Resumo do dia"
            />
          }
        />
      </ListCardGroup>

      {settings.enabled && (
        <div className={shared.fieldGroup}>
          <Select
            id="settings-daily-summary-time"
            label="Horário"
            options={timeOptions}
            value={settings.sendTime}
            onChange={(e) => void save({ sendTime: e.target.value })}
            disabled={loading || saving}
            helperText={`No seu fuso horário (${settings.timezone}). Só enviamos quando há algo para hoje.`}
          />
        </div>
      )}

      {settings.enabled && !whatsappLinked && (
        <div className={styles.notice}>
          <p className={shared.sectionDescription}>
            Conecte seu WhatsApp para receber o Resumo do dia.
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
