import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { addDays, parseDateKey, startOfDay, toDateKey } from './dates';

/**
 * Today's date (local midnight) as state, so "Hoje", "Vencidas" and date
 * labels roll over at midnight and when the app returns from the background.
 * Screens must take "now" from here: values computed from `new Date()` during
 * render are memoized (React Compiler, memo rows) and would go stale.
 */
export function useToday(): Date {
  const [key, setKey] = useState(() => toDateKey(new Date()));

  useEffect(() => {
    const refresh = () => setKey(toDateKey(new Date()));
    const now = new Date();
    const untilMidnight = addDays(startOfDay(now), 1).getTime() - now.getTime();
    const timer = setTimeout(refresh, untilMidnight + 1000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [key]);

  return useMemo(() => parseDateKey(key) ?? startOfDay(new Date()), [key]);
}
