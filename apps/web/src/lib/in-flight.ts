/**
 * Share one in-flight promise per key so concurrent callers do not duplicate
 * a side-effecting request (e.g. POST /auth/verify on register).
 */
export function createInFlight<T>() {
  const map = new Map<string, Promise<T>>();
  return (key: string, fn: () => Promise<T>): Promise<T> => {
    const existing = map.get(key);
    if (existing) return existing;
    const p = fn().finally(() => {
      if (map.get(key) === p) map.delete(key);
    });
    map.set(key, p);
    return p;
  };
}
