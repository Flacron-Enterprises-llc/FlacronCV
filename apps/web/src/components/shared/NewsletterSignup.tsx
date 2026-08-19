'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';

/** Version of the consent copy — bump when `newsletter.consent_label` changes. */
const CONSENT_VERSION = 'v1';

/**
 * Footer newsletter opt-in → the public `POST /leads` (Epic C1/C2).
 * GDPR: the consent checkbox is NEVER pre-checked and the submit stays disabled
 * until it's ticked; the exact label shown is stored as the consent record.
 * The backend is double-opt-in, so success tells the user to confirm by email.
 */
export default function NewsletterSignup() {
  const t = useTranslations('newsletter');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) {
      toast.error(t('consent_required'));
      return;
    }
    setLoading(true);
    try {
      await api.post('/leads', {
        email: email.trim(),
        source: 'footer_newsletter',
        consent: true,
        consentText: t('consent_label'),
        consentVersion: CONSENT_VERSION,
      });
      setDone(true);
    } catch (err) {
      toast.error((err as Error)?.message || t('error'));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
      >
        <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
        <span>{t('success')}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="lg:max-w-sm">
        <h3 className="text-base font-semibold text-white">{t('heading')}</h3>
        <p className="mt-1 text-sm text-stone-300 dark:text-stone-400">{t('subtext')}</p>
      </div>
      <form onSubmit={handleSubmit} className="w-full lg:max-w-md">
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="newsletter-email" className="sr-only">{t('email_placeholder')}</label>
          <input
            id="newsletter-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('email_placeholder')}
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-stone-600 dark:bg-stone-800 dark:text-white"
          />
          <button
            type="submit"
            disabled={loading || !consent}
            className="shrink-0 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? t('subscribing') : t('subscribe')}
          </button>
        </div>
        <label className="mt-2 flex items-start gap-2 text-xs text-stone-300 dark:text-stone-400">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-stone-300 text-brand-600 focus:ring-brand-500"
          />
          <span>{t('consent_label')}</span>
        </label>
      </form>
    </div>
  );
}
