import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api.js';

/** Fetch-on-mount with a manual reload, so mutations can refresh the table. */
export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    api<T>(path)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load data'))
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(reload, [reload]);

  return { data, error, loading, reload };
}
