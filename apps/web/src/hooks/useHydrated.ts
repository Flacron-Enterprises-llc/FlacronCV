'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False during the server render and the hydration pass, true afterwards.
 *
 * Used to keep a form's submit disabled until React has attached its handlers:
 * before that the form is plain HTML, and submitting it does a native GET with
 * the field values in the URL.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
