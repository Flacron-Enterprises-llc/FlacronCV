import { useQuery } from '@tanstack/react-query';
import { type AppConfig, parseAppConfig } from '../components/app/app-notices';
import { api } from '../lib/api';

/**
 * GET /app-config — the PUBLIC operator settings (announcement, maintenance,
 * feature flags). Same query key and freshness as the website so every notice
 * shares one request. A failed read shows nothing (fails open), as on the web.
 *
 * `pollWhile` re-fetches every minute while it returns true for the current
 * config (the maintenance screen uses it to lift itself when maintenance ends).
 */
export function useAppConfig(opts?: { pollWhile?: (config: AppConfig | undefined) => boolean }) {
  const pollWhile = opts?.pollWhile;
  return useQuery({
    queryKey: ['app-config'],
    queryFn: async () => parseAppConfig(await api.get<unknown>('/app-config')),
    staleTime: 60_000,
    refetchInterval: pollWhile ? (query) => (pollWhile(query.state.data) ? 60_000 : false) : false,
  });
}
