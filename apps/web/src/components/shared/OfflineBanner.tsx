'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CloudOff, Wifi } from 'lucide-react';

/**
 * "You're offline" while the browser reports no connection, then "Back online"
 * for a moment. Fixed at the bottom centre, never blocks clicks, announced
 * politely. Starts hidden on the server and first paint (no hydration flash).
 */
export default function OfflineBanner() {
  const t = useTranslations('common');
  const [offline, setOffline] = useState(false);
  const [backOnline, setBackOnline] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let wasOffline = false;
    const goOffline = () => {
      if (timer.current) clearTimeout(timer.current);
      wasOffline = true;
      setBackOnline(false);
      setOffline(true);
    };
    const goOnline = () => {
      setOffline(false);
      if (!wasOffline) return;
      wasOffline = false;
      setBackOnline(true);
      timer.current = setTimeout(() => setBackOnline(false), 2500);
    };
    if (navigator.onLine === false) goOffline();
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4" role="status" aria-live="polite">
      {offline || backOnline ? (
        <div
          className={
            offline
              ? 'flex items-center gap-2 rounded-full bg-navy px-5 py-3 text-sm font-semibold text-white shadow-xl'
              : 'flex items-center gap-2 rounded-full bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-xl'
          }
        >
          {offline ? <CloudOff className="h-4 w-4 text-brand-300" aria-hidden="true" /> : <Wifi className="h-4 w-4" aria-hidden="true" />}
          {offline ? t('offline_banner') : t('back_online')}
        </div>
      ) : null}
    </div>
  );
}
