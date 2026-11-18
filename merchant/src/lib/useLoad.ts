import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { errorMessage } from './format';
import { registerRefresher } from './refreshBus';

/**
 * Loads data every time the screen gains focus (so a payment made elsewhere
 * shows up without restarting) and supports pull-to-refresh. Stale responses
 * from a superseded load are discarded.
 */
export function useLoad<T>(fetcher: () => Promise<T>, errorFallback = 'Could not load data') {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (isRefresh: boolean, isCancelled: () => boolean) => {
      if (isRefresh) setRefreshing(true);
      try {
        const result = await fetcher();
        if (isCancelled()) return;
        setData(result);
        setError(null);
      } catch (e) {
        if (!isCancelled()) setError(errorMessage(e, errorFallback));
      } finally {
        if (!isCancelled()) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void run(false, () => cancelled);
      return () => {
        cancelled = true;
      };
    }, [run]),
  );

  // Joins the app-wide pull-to-refresh, so this data reloads together with the screen being pulled.
  useEffect(() => registerRefresher(() => run(true, () => false)), [run]);

  const refresh = useCallback(() => {
    void run(true, () => false);
  }, [run]);

  return { data, loading, refreshing, error, refresh, setData };
}
