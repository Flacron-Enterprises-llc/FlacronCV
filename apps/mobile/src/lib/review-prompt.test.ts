import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => new Map<string, string>());
const review = vi.hoisted(() => ({ isAvailableAsync: vi.fn(async () => true), hasAction: vi.fn(async () => true), requestReview: vi.fn(async () => undefined) }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async (k: string) => storage.get(k) ?? null, setItem: async (k: string, v: string) => void storage.set(k, v) },
}));
vi.mock('expo-store-review', () => review);

const { COOLDOWN_MS, recordSuccessAndMaybeAskForReview, shouldAskForReview } = await import('./review-prompt');

describe('review prompt', () => {
  beforeEach(() => {
    storage.clear();
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['setTimeout'] });
  });

  it('waits for the second success and then respects a 90-day cooldown', () => {
    expect(shouldAskForReview({ successes: 1, lastAskedAt: null }, 0)).toBe(false);
    expect(shouldAskForReview({ successes: 2, lastAskedAt: null }, 0)).toBe(true);
    expect(shouldAskForReview({ successes: 9, lastAskedAt: 1000 }, 1000 + COOLDOWN_MS - 1)).toBe(false);
    expect(shouldAskForReview({ successes: 9, lastAskedAt: 1000 }, 1000 + COOLDOWN_MS)).toBe(true);
  });

  it('asks once on the second export, not on the first or the third', async () => {
    const run = async (now: number) => {
      const p = recordSuccessAndMaybeAskForReview(now);
      await vi.runAllTimersAsync();
      await p;
    };
    await run(1);
    expect(review.requestReview).not.toHaveBeenCalled();
    await run(2);
    expect(review.requestReview).toHaveBeenCalledTimes(1);
    await run(3);
    expect(review.requestReview).toHaveBeenCalledTimes(1);
  });

  it('never asks where the store sheet is unavailable, and never throws', async () => {
    review.isAvailableAsync.mockResolvedValue(false);
    for (const now of [1, 2, 3]) await recordSuccessAndMaybeAskForReview(now);
    expect(review.requestReview).not.toHaveBeenCalled();
    review.isAvailableAsync.mockRejectedValue(new Error('boom'));
    await expect(recordSuccessAndMaybeAskForReview(4)).resolves.toBeUndefined();
  });
});
