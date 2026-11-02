/**
 * A fixed window in this process. It does not call a provider and it does
 * not write the ledger. A later deploy can replace the store.
 */
export class WindowRateLimit {
  private readonly hits = new Map<string, { count: number; start: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  take(key: string, now: Date): { allowed: boolean; limit: number; retryAt: string } {
    const at = now.getTime();
    const current = this.hits.get(key);
    const fresh = !current || at - current.start >= this.windowMs;
    const start = fresh ? at : current.start;
    const count = (fresh ? 0 : current.count) + 1;
    this.hits.set(key, { count, start });
    return {
      allowed: count <= this.limit,
      limit: this.limit,
      retryAt: new Date(start + this.windowMs).toISOString(),
    };
  }
}
