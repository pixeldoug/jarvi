/**
 * TasksPage - SettingsDialog
 *
 * "Tarefas" tab: what Jarvi does on its own on the Tasks page.
 *
 *   - Recap de tarefas vencidas → once a day, on opening Tarefas, review the
 *     overdue tasks one by one (off by default)
 *
 * The value lives on the user (`overdueRecapEnabled`, from the profile) so the
 * Tasks page reads it without another request. Saving is optimistic and
 * reverts on failure.
 */

import { useState } from 'react';
import { CardsThree } from '@phosphor-icons/react';
import { ListCard, ListCardGroup, Switch, toast } from '../../../../ui';
import { useAuth } from '../../../../../contexts/AuthContext';
import shared from '../SettingsDialog.module.css';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

const RECAP_NAME = 'Recap de tarefas vencidas';
const SAVE_ERROR = 'Erro ao salvar o Recap de tarefas vencidas';

export function TasksPage() {
  const { user, token, updateUser } = useAuth();
  const enabled = user?.overdueRecapEnabled === true;
  const [saving, setSaving] = useState(false);

  const save = async (next: boolean) => {
    updateUser({ overdueRecapEnabled: next });
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/users/overdue-recap`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || SAVE_ERROR);
      toast.success(next ? `${RECAP_NAME} ativado.` : `${RECAP_NAME} desativado.`);
    } catch (error) {
      updateUser({ overdueRecapEnabled: !next });
      toast.error(error instanceof Error ? error.message : SAVE_ERROR);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={shared.section}>
      <ListCardGroup>
        <ListCard
          as="li"
          icon={<CardsThree size={24} weight="regular" />}
          title={RECAP_NAME}
          description="Uma vez por dia, ao abrir Tarefas, revise uma a uma as que passaram do prazo."
          action={
            <Switch
              checked={enabled}
              onChange={(checked) => void save(checked)}
              disabled={saving}
              aria-label="Ativar Recap de tarefas vencidas"
            />
          }
        />
      </ListCardGroup>
    </div>
  );
}
