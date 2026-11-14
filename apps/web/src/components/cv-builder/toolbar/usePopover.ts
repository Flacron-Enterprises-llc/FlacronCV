'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Open/close state for a toolbar popover (Design, Font): closes on Escape and
 * hands focus back to the button that opened it. Neither panel did either, so a
 * keyboard user who opened one had to tab through all of it to get out, and
 * then lost their place in the toolbar.
 */
export function usePopover<T extends HTMLElement = HTMLButtonElement>() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<T>(null);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  return { open, setOpen, close, triggerRef };
}

/**
 * Panel position classes shared by the toolbar popovers. Below `sm` the panel
 * is a fixed, full-width bottom sheet: as an absolutely-positioned dropdown
 * anchored to its button it was pushed off the left edge of a 390px screen.
 */
export const POPOVER_SHEET =
  'fixed inset-x-0 bottom-0 z-40 max-h-[80vh] overflow-y-auto rounded-t-2xl border border-stone-200 bg-white shadow-xl ' +
  'dark:border-stone-700 dark:bg-stone-900 ' +
  'sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-full sm:mt-2 sm:max-h-[calc(100vh-120px)] sm:rounded-xl';
