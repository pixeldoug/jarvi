import { useEffect, useState } from 'react';
import { formatElapsed } from './useNoteRecorder';

/** Formatted time since `startedAt` (Date.now() ms), ticking twice a second. */
export function useElapsed(startedAt: number | null): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt === null) return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(interval);
  }, [startedAt]);

  return formatElapsed(startedAt === null ? 0 : now - startedAt);
}
