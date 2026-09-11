import { describe, it, expect, vi } from 'vitest';
import { createInFlight } from './in-flight';

describe('createInFlight', () => {
  it('returns the same promise while the first call is in flight', async () => {
    const run = createInFlight<number>();
    let starts = 0;
    const fn = () => {
      starts += 1;
      return new Promise<number>((resolve) => setTimeout(() => resolve(1), 20));
    };

    const a = run('k', fn);
    const b = run('k', fn);
    expect(a).toBe(b);
    await expect(Promise.all([a, b])).resolves.toEqual([1, 1]);
    expect(starts).toBe(1);
  });

  it('starts a new call after the previous one settles', async () => {
    const run = createInFlight<number>();
    const fn = vi.fn(async () => 1);
    await run('k', fn);
    await run('k', fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
