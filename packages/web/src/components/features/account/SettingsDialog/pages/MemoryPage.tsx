/**
 * MemoryPage - SettingsDialog
 *
 * "Memória" tab: shared memory context for AI personalization.
 *
 * Figma: https://figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-App
 * Node: 40001298-53844
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../../../../../contexts/AuthContext';
import { Button, TextArea, toast } from '../../../../ui';
import styles from '../SettingsDialog.module.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function MemoryPage() {
  const { token } = useAuth();
  const [memoryText, setMemoryText] = useState('');
  const [originalMemoryText, setOriginalMemoryText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);

    fetch(`${API_URL}/api/users/memory-profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled && typeof data.memoryText === 'string') {
          setMemoryText(data.memoryText);
          setOriginalMemoryText(data.memoryText);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[MemoryPage] Erro ao carregar memória:', err);
          toast.error('Não foi possível carregar sua memória.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/users/memory-profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ memoryText, consentAiMemory: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao salvar memória');
      setOriginalMemoryText(memoryText);
      toast.success(data.message || 'Memória atualizada com sucesso!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar memória');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setMemoryText(originalMemoryText);
  };

  return (
    <>
      <p className={styles.sectionLabel}>
        Gerencie o que a Jarvi sabe sobre você para respostas mais relevantes e personalizadas.
      </p>

      <TextArea
        id="memory-text"
        value={memoryText}
        onChange={(e) => setMemoryText(e.target.value)}
        rows={16}
        resize="none"
        disabled={loading || saving}
      />

      <div className={styles.memoryActions}>
        <Button
          variant="primary"
          disabled={loading || saving}
          loading={saving}
          onClick={handleSave}
        >
          Salvar Memória
        </Button>
        <Button
          variant="secondary"
          disabled={loading || saving}
          onClick={handleCancel}
        >
          Cancelar
        </Button>
      </div>
    </>
  );
}
