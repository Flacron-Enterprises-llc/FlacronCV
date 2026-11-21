'use client';

import { useEffect } from 'react';
import CrashFallback from '@/components/shared/CrashFallback';

/**
 * Next.js route error boundary for every page under [locale]: replaces the
 * bare "Application error" screen with a branded one. The layout (header,
 * fonts, translations) stays mounted; "Try again" re-renders the segment.
 */
export default function LocaleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[route error]', error);
  }, [error]);
  return (
    <main id="main-content">
      <CrashFallback onRetry={reset} fullPage digest={error.digest} />
    </main>
  );
}
