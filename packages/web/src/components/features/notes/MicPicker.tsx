/**
 * MicPicker — chooses the microphone for the next recording.
 * Device labels only appear after the browser granted mic permission.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { CaretDown, Microphone } from '@phosphor-icons/react';
import { Button, Dropdown, ListItem } from '../../ui';
import { setPreferredMicId, usePreferredMicId } from './micPreference';
import { useNoteRecorder } from './useNoteRecorder';
import styles from './MicPicker.module.css';

const DEFAULT_LABEL = 'Microfone padrão';
/** Chrome's virtual aliases — "Microfone padrão" already covers them. */
const ALIAS_DEVICE_IDS = new Set(['default', 'communications']);

interface MicDevice {
  deviceId: string;
  label: string;
}

async function listMicrophones(): Promise<MicDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'audioinput' && d.deviceId && !ALIAS_DEVICE_IDS.has(d.deviceId))
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microfone ${i + 1}` }));
}

export function MicPicker() {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [devices, setDevices] = useState<MicDevice[]>([]);
  const selectedId = usePreferredMicId();
  const { status } = useNoteRecorder();

  const refresh = useCallback(() => {
    listMicrophones()
      .then(setDevices)
      .catch(() => setDevices([]));
  }, []);

  useEffect(() => {
    refresh();
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) return;
    mediaDevices.addEventListener('devicechange', refresh);
    return () => mediaDevices.removeEventListener('devicechange', refresh);
  }, [refresh]);

  // Labels become readable once a recording got mic permission.
  useEffect(() => {
    if (status === 'recording') refresh();
  }, [status, refresh]);

  const selected = devices.find((d) => d.deviceId === selectedId);
  const label = selected?.label ?? DEFAULT_LABEL;

  const choose = (deviceId: string) => {
    setPreferredMicId(deviceId);
    setIsOpen(false);
  };

  return (
    <div ref={anchorRef} className={styles.anchor}>
      <Button
        variant="ghost"
        size="small"
        icon={Microphone}
        iconPosition="left"
        active={isOpen}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={label}
        onClick={() => {
          if (!isOpen) refresh();
          setIsOpen((open) => !open);
        }}
      >
        <span className={styles.label}>
          <span className={styles.labelText}>{label}</span>
          <CaretDown size={12} weight="bold" aria-hidden="true" />
        </span>
      </Button>
      <Dropdown
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        align="right"
        width={280}
      >
        <ListItem
          label={DEFAULT_LABEL}
          active={!selected}
          onClick={() => choose('')}
          buttonProps={{ role: 'menuitemradio', 'aria-checked': !selected }}
        />
        {devices.map((device) => (
          <ListItem
            key={device.deviceId}
            label={device.label}
            active={device.deviceId === selected?.deviceId}
            onClick={() => choose(device.deviceId)}
            buttonProps={{
              role: 'menuitemradio',
              'aria-checked': device.deviceId === selected?.deviceId,
            }}
          />
        ))}
      </Dropdown>
    </div>
  );
}
