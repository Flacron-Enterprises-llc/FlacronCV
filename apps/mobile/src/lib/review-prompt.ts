import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

/**
 * Asks for an App Store / Google Play rating at a good moment: right after
 * the person got something they came for (a CV exported), never in the middle
 * of a task. Uses the stores' own in-app review sheet (the OS may decide not to
 * show it; Apple caps it at three times a year). Rules, all on this device:
 * - only from the 2nd successful export on (they have seen the app work),
 * - at most once every 90 days.
 */
const KEY = 'flacroncv_review_prompt_v1';
export const MIN_SUCCESSES = 2;
export const COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;

export interface ReviewState {
  successes: number;
  lastAskedAt: number | null;
}

/** Pure rule, tested on its own. */
export function shouldAskForReview(state: ReviewState, now: number): boolean {
  if (state.successes < MIN_SUCCESSES) return false;
  return state.lastAskedAt === null || now - state.lastAskedAt >= COOLDOWN_MS;
}

async function readState(): Promise<ReviewState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<ReviewState>) : {};
    return {
      successes: typeof parsed.successes === 'number' ? parsed.successes : 0,
      lastAskedAt: typeof parsed.lastAskedAt === 'number' ? parsed.lastAskedAt : null,
    };
  } catch {
    return { successes: 0, lastAskedAt: null };
  }
}

/** Call after a successful, user-visible win (an export). Never throws. */
export async function recordSuccessAndMaybeAskForReview(now: number = Date.now()): Promise<void> {
  try {
    const state = await readState();
    const next: ReviewState = { ...state, successes: state.successes + 1 };
    const ask = shouldAskForReview(next, now) && (await StoreReview.isAvailableAsync()) && (await StoreReview.hasAction());
    if (ask) next.lastAskedAt = now;
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    if (ask) {
      // Let the share sheet finish closing first so the review sheet does not collide with it.
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await StoreReview.requestReview();
    }
  } catch {
    // A rating prompt must never break an export.
  }
}
