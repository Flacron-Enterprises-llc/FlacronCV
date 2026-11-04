'use client';

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Modal from '@/components/ui/Modal';
import { Button } from './components/Button';

/**
 * The guard the current page registered, so code that navigates
 * programmatically (for example after copying a draft into V1) can ask first.
 * One editor page is mounted at a time; the last registration wins.
 */
let activeConfirm: (() => Promise<boolean>) | null = null;

/**
 * The App Router when one is mounted. Outside it (component tests) the hook is
 * always called the same way and simply returns null; links then fall back to
 * a full navigation.
 */
function useOptionalRouter(): ReturnType<typeof useRouter> | null {
  try {
    return useRouter();
  } catch {
    return null;
  }
}

/** Resolves true when it is fine to leave the page (nothing unsaved, or the person chose Leave). */
export function confirmLeaveIfUnsaved(): Promise<boolean> {
  return activeConfirm ? activeConfirm() : Promise.resolve(true);
}

/**
 * Warns before unsaved career edits are lost:
 * - closing or reloading the tab (`beforeunload`);
 * - internal links and menus (any same-origin `<a>`, caught before Next's own handler);
 * - browser Back (a history entry is held while there are unsaved changes);
 * - switching documents or programmatic navigation (`confirm()` / `confirmLeaveIfUnsaved()`).
 * One accessible dialog with Stay / Leave; Escape or the backdrop means Stay.
 * A second request while the dialog is open is answered "stay" (no stacked dialogs).
 */
export function useUnsavedChangesGuard(dirty: boolean): { confirm: () => Promise<boolean>; dialog: ReactElement | null } {
  const t = useTranslations('career.unsaved');
  const router = useOptionalRouter();
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const pendingRef = useRef<((leave: boolean) => void) | null>(null);
  const [open, setOpen] = useState(false);

  const confirm = useCallback((): Promise<boolean> => {
    if (!dirtyRef.current) return Promise.resolve(true);
    if (pendingRef.current) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      pendingRef.current = (leave: boolean) => {
        pendingRef.current = null;
        setOpen(false);
        if (leave) dirtyRef.current = false;
        resolve(leave);
      };
      setOpen(true);
    });
  }, []);

  useEffect(() => {
    activeConfirm = confirm;
    return () => {
      if (activeConfirm === confirm) activeConfirm = null;
    };
  }, [confirm]);

  // Closing or reloading the tab: the browser's own prompt (custom text is not allowed there).
  useEffect(() => {
    if (!dirty) return undefined;
    const onLeave = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  // Internal links: caught in the capture phase, before Next's <Link> navigates.
  useEffect(() => {
    if (!dirty) return undefined;
    const onClick = (event: MouseEvent) => {
      if (!dirtyRef.current || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; // new tab/window keeps this page
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return; // in-page anchor
      event.preventDefault();
      event.stopPropagation();
      void confirm().then((leave) => {
        if (!leave) return;
        const target = `${url.pathname}${url.search}${url.hash}`;
        if (router) router.push(target);
        else window.location.assign(target);
      });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [dirty, confirm, router]);

  // Browser Back: hold one extra entry for this page while there are unsaved changes.
  useEffect(() => {
    if (!dirty) return undefined;
    window.history.pushState({ ...(window.history.state ?? {}), fcUnsavedGuard: true }, '', window.location.href);
    let leaving = false;
    const onPop = () => {
      if (leaving || !dirtyRef.current) return;
      // Back took us off the held entry; put it back, then ask.
      window.history.pushState({ ...(window.history.state ?? {}), fcUnsavedGuard: true }, '', window.location.href);
      void confirm().then((leave) => {
        if (!leave) return;
        leaving = true;
        window.history.go(-2);
      });
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Saved (or left): drop the held entry so history is as before.
      if (!leaving && (window.history.state as { fcUnsavedGuard?: boolean } | null)?.fcUnsavedGuard) {
        leaving = true;
        window.history.back();
      }
    };
  }, [dirty, confirm]);

  const dialog = open ? (
    <Modal isOpen onClose={() => pendingRef.current?.(false)} title={t('title')} size="sm">
      <p className="text-sm text-stone-600 dark:text-stone-300">{t('body')}</p>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={() => pendingRef.current?.(true)}>
          {t('leave')}
        </Button>
        <Button type="button" onClick={() => pendingRef.current?.(false)} autoFocus>
          {t('stay')}
        </Button>
      </div>
    </Modal>
  ) : null;

  return { confirm, dialog };
}
