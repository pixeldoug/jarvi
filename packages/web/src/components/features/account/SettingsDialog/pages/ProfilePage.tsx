/**
 * ProfilePage - SettingsDialog
 *
 * "Meu perfil" tab: avatar, name, timezone, email, connected account, delete account.
 * Logic extracted from AccountDialog + pages/Settings.
 */

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../../../../contexts/AuthContext';
import {
  Avatar,
  Button,
  Divider,
  TextInput,
  Select,
  toast,
} from '../../../../ui';
import { GoogleLogin } from '../../../auth';
import type { SelectOption } from '../../../../ui';
import styles from '../SettingsDialog.module.css';

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const TIMEZONES: SelectOption[] = [
  { value: 'America/Sao_Paulo',               label: 'Brasília (UTC-3)' },
  { value: 'America/Manaus',                  label: 'Manaus (UTC-4)' },
  { value: 'America/Belem',                   label: 'Belém / Fortaleza (UTC-3)' },
  { value: 'America/Noronha',                 label: 'Fernando de Noronha (UTC-2)' },
  { value: 'America/Rio_Branco',              label: 'Rio Branco (UTC-5)' },
  { value: 'America/New_York',                label: 'Nova York / Miami (UTC-5/-4)' },
  { value: 'America/Chicago',                 label: 'Chicago / Dallas (UTC-6/-5)' },
  { value: 'America/Denver',                  label: 'Denver / Phoenix (UTC-7/-6)' },
  { value: 'America/Los_Angeles',             label: 'Los Angeles / Seattle (UTC-8/-7)' },
  { value: 'America/Anchorage',               label: 'Anchorage (UTC-9/-8)' },
  { value: 'Pacific/Honolulu',                label: 'Havaí (UTC-10)' },
  { value: 'America/Toronto',                 label: 'Toronto / Montreal (UTC-5/-4)' },
  { value: 'America/Vancouver',               label: 'Vancouver (UTC-8/-7)' },
  { value: 'America/Mexico_City',             label: 'Cidade do México (UTC-6/-5)' },
  { value: 'America/Argentina/Buenos_Aires',  label: 'Buenos Aires (UTC-3)' },
  { value: 'America/Santiago',                label: 'Santiago (UTC-4/-3)' },
  { value: 'America/Lima',                    label: 'Lima / Bogotá (UTC-5)' },
  { value: 'Europe/Lisbon',                   label: 'Lisboa (UTC+0/+1)' },
  { value: 'Europe/London',                   label: 'Londres (UTC+0/+1)' },
  { value: 'Europe/Madrid',                   label: 'Madrid / Paris (UTC+1/+2)' },
  { value: 'Europe/Berlin',                   label: 'Berlim / Amsterdã (UTC+1/+2)' },
  { value: 'Europe/Rome',                     label: 'Roma / Milão (UTC+1/+2)' },
  { value: 'Europe/Moscow',                   label: 'Moscou (UTC+3)' },
  { value: 'Asia/Dubai',                      label: 'Dubai (UTC+4)' },
  { value: 'Asia/Kolkata',                    label: 'Índia (UTC+5:30)' },
  { value: 'Asia/Bangkok',                    label: 'Bangkok / Jacarta (UTC+7)' },
  { value: 'Asia/Singapore',                  label: 'Singapura / Kuala Lumpur (UTC+8)' },
  { value: 'Asia/Shanghai',                   label: 'Xangai / Pequim (UTC+8)' },
  { value: 'Asia/Tokyo',                      label: 'Tóquio (UTC+9)' },
  { value: 'Australia/Sydney',                label: 'Sydney (UTC+10/+11)' },
];

export function ProfilePage() {
  const { user, updateUser, token, logout } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user?.name || '');
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);

  const [timezone, setTimezone] = useState('America/Sao_Paulo');
  const [timezoneSaving, setTimezoneSaving] = useState(false);

  const [disconnectError, setDisconnectError] = useState('');

  const isGoogleUser = user?.authProvider === 'google';
  const userName = user?.name || 'Usuário';
  const userEmail = user?.email || '';
  const userAvatar = user?.avatar;

  // Load timezone
  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/users/timezone`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => { if (data.timezone) setTimezone(data.timezone); })
      .catch(() => {});
  }, [token]);

  // Avatar handlers
  const handleUpdateImage = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Formato inválido. Use JPG, PNG ou WebP.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('Imagem muito grande. Máximo 4MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        setIsUploading(true);
        const response = await fetch(`${API_URL}/api/users/avatar`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ avatar: reader.result }),
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Erro ao atualizar avatar');
        }
        const data = await response.json();
        updateUser({ avatar: data.avatar });
        toast.success('Avatar atualizado com sucesso!');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Erro ao atualizar avatar');
      } finally {
        setIsUploading(false);
      }
    };
    reader.onerror = () => toast.error('Erro ao ler o arquivo');
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = async () => {
    if (!userAvatar) {
      toast.info('Você não tem uma imagem de perfil para remover.');
      return;
    }
    try {
      setIsRemoving(true);
      const response = await fetch(`${API_URL}/api/users/avatar`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Erro ao remover avatar');
      }
      updateUser({ avatar: undefined });
      toast.success('Avatar removido com sucesso!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao remover avatar');
    } finally {
      setIsRemoving(false);
    }
  };

  // Name handler
  const handleNameBlur = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName === user?.name) {
      if (!trimmedName) setName(user?.name || '');
      return;
    }
    try {
      setIsSavingName(true);
      const response = await fetch(`${API_URL}/api/users/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: trimmedName }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Erro ao atualizar nome');
      }
      updateUser({ name: trimmedName });
      toast.success('Nome atualizado com sucesso!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar nome');
      setName(user?.name || '');
    } finally {
      setIsSavingName(false);
    }
  };

  // Timezone handler — auto-save on change
  const handleTimezoneChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTz = e.target.value;
    setTimezone(newTz);
    setTimezoneSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/users/timezone`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ timezone: newTz }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Erro ao salvar fuso horário');
      }
      toast.success('Fuso horário atualizado!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar fuso horário');
    } finally {
      setTimezoneSaving(false);
    }
  };

  // Google disconnect
  const handleDisconnectGoogle = async () => {
    const confirmed = window.confirm(
      'Tem certeza que deseja desconectar sua conta do Google? Isso excluirá permanentemente sua conta e todos os seus dados.'
    );
    if (!confirmed) return;
    setDisconnectError('');
    try {
      const response = await fetch(`${API_URL}/api/auth/google/disconnect`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao desconectar conta Google');
      logout();
    } catch (error) {
      setDisconnectError(error instanceof Error ? error.message : 'Erro ao desconectar conta Google');
    }
  };

  const handleDeleteAccount = () => {
    toast.info('Em breve: Deletar conta');
  };

  return (
    <>
      {/* Avatar + Name + Timezone */}
      <div className={styles.section}>
        <div className={styles.profileDetails}>
          <Avatar src={userAvatar} name={userName} size="large" />
          <div className={styles.profileActions}>
            <div className={styles.buttonGroup}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <Button
                variant="secondary"
                onClick={handleUpdateImage}
                loading={isUploading}
                disabled={isUploading || isRemoving}
              >
                {isUploading ? 'Enviando...' : 'Atualizar Imagem'}
              </Button>
              <Button
                variant="secondary"
                onClick={handleRemoveImage}
                loading={isRemoving}
                disabled={isUploading || isRemoving || !userAvatar}
              >
                {isRemoving ? 'Removendo...' : 'Remover'}
              </Button>
            </div>
            <p className={styles.helpText}>Escolha uma imagem de até 4MB.</p>
          </div>
        </div>

        <div className={styles.fieldGroup}>
          <TextInput
            id="settings-name"
            label="Nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleNameBlur}
            placeholder="Seu nome"
            disabled={isSavingName}
          />
        </div>

        <div className={styles.fieldGroup}>
          <Select
            id="settings-timezone"
            label="Fuso Horário"
            options={TIMEZONES}
            value={timezone}
            onChange={handleTimezoneChange}
            disabled={timezoneSaving}
            helperText="Usado pela Jarvi para interpretar corretamente datas e horários nas suas tarefas."
          />
        </div>
      </div>

      <Divider />

      {/* Email */}
      <div className={styles.section}>
        <div className={styles.emailDetails}>
          <p className={styles.emailLabel}>Email</p>
          <p className={styles.emailValue}>{userEmail}</p>
        </div>
      </div>

      {/* Connected Account — Google users only */}
      {isGoogleUser && (
        <>
          <Divider />
          <div className={styles.section}>
            <div className={styles.emailDetails}>
              <p className={styles.sectionLabel}>Conta conectada</p>
              <p className={styles.sectionDescription}>
                Você pode fazer login no Jarvi com sua conta do Google {userEmail}
              </p>
            </div>
            {disconnectError && (
              <p className={styles.sectionDescription} style={{ color: 'var(--semantic-content-error)' }}>
                {disconnectError}
              </p>
            )}
            <div className={styles.googleButtonWrapper}>
              <GoogleLogin
                buttonText="Desconectar Google"
                onClick={handleDisconnectGoogle}
              />
            </div>
          </div>
        </>
      )}

      <Divider />

      {/* Delete Account */}
      <div className={styles.section}>
        <p className={styles.sectionLabel}>Deletar Conta</p>
        <div className={styles.deleteInfo}>
          <Button variant="destructive" onClick={handleDeleteAccount}>
            Deletar Conta
          </Button>
          <p className={styles.deleteWarning}>
            Excluir sua conta é permanente. Você perderá imediatamente o acesso a todos os seus dados.
          </p>
        </div>
      </div>
    </>
  );
}
