import React from 'react';

/**
 * Passive product warning for AI / ATS / cover-letter / export screens.
 * Not a legal-document body — copy is localised via t().
 */
export default function InAppWarning({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="note"
      className="rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200"
    >
      {children}
    </p>
  );
}
