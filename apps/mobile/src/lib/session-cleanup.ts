/**
 * Everything account-specific the app holds in memory, dropped on every
 * sign-out path (manual sign-out, expired session, account deletion).
 *
 * V1's query keys (['cvs', …], ['user'], ['jobs']) do not carry the uid, so
 * without this the next account signing in on the same device could briefly
 * be shown the previous account's cached CVs, letters or jobs.
 */
export function clearAccountCaches(deps: { queryClient: { clear: () => void; cancelQueries?: () => unknown }; careerDrafts: { clearAll: () => void } }): void {
  deps.queryClient.cancelQueries?.();
  deps.queryClient.clear();
  deps.careerDrafts.clearAll();
}
