'use client';

import { ReactNode, useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import Modal from '@/components/ui/Modal';
import {
  ACCEPT_ALL,
  REJECT_NON_ESSENTIAL,
  type ConsentChoice,
  onPreferencesOpen,
  readConsent,
  saveConsent,
} from '@/lib/consent';

/**
 * Cookie banner and preference centre.
 *
 * Three categories, because three are real — see {@link @/lib/consent} for why
 * Marketing is deliberately absent. Two rules shape the markup here:
 *
 *  - **Rejection carries the same weight as acceptance.** "Accept All" and
 *    "Reject Non-Essential" share one set of classes deliberately. Do not make
 *    the reject button quieter, smaller, or a link; consent obtained by making
 *    refusal harder is not freely given.
 *  - **Nothing is pre-ticked.** A visitor who accepted under the old
 *    one-boolean banner reads as undecided (see `readConsent`), and the panel
 *    opens with every optional category off until they choose.
 */
export default function CookieConsent() {
  const t = useTranslations('cookie_consent');
  const [bannerVisible, setBannerVisible] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [draft, setDraft] = useState<ConsentChoice>(REJECT_NON_ESSENTIAL);

  useEffect(() => {
    const record = readConsent();
    setBannerVisible(record === null);
    if (record) setDraft({ preferences: record.preferences, analytics: record.analytics });
  }, []);

  // The footer's "Cookie Preferences" control reaches the panel through this,
  // from any page and long after the banner is gone.
  useEffect(
    () =>
      onPreferencesOpen(() => {
        const record = readConsent();
        setDraft(
          record ? { preferences: record.preferences, analytics: record.analytics } : REJECT_NON_ESSENTIAL,
        );
        setPanelOpen(true);
      }),
    [],
  );

  const decide = (choice: ConsentChoice) => {
    saveConsent(choice);
    setDraft(choice);
    setBannerVisible(false);
    setPanelOpen(false);
  };

  const linkClass =
    'font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700 dark:text-brand-400';

  // Both policy links live inside one translated sentence, so the copy stays a
  // single translatable unit instead of being spliced together per locale.
  const policyLinks = {
    cookies: (chunks: ReactNode) => (
      <Link href="/cookie-policy" className={linkClass}>
        {chunks}
      </Link>
    ),
    privacy: (chunks: ReactNode) => (
      <Link href="/privacy-policy" className={linkClass}>
        {chunks}
      </Link>
    ),
  };

  const decisiveButtonClass =
    'rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2';

  return (
    <>
      {/* Hidden while the panel is open: the banner sits above the modal's
          backdrop otherwise, and it reappears if the panel is dismissed
          without a decision. */}
      {bannerVisible && !panelOpen && (
        <div
          role="region"
          aria-label={t('aria_label')}
          className="fixed inset-x-0 bottom-0 z-[90] border-t border-stone-200 bg-white/95 p-4 shadow-lg backdrop-blur motion-safe:animate-fade-in dark:border-stone-700 dark:bg-stone-900/95"
        >
          <div className="mx-auto flex max-w-5xl flex-col items-start gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-stone-900 dark:text-white">{t('title')}</h2>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
                {t.rich('message', policyLinks)}
              </p>
            </div>
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
              <button type="button" onClick={() => decide(ACCEPT_ALL)} className={decisiveButtonClass}>
                {t('accept_all')}
              </button>
              <button
                type="button"
                onClick={() => decide(REJECT_NON_ESSENTIAL)}
                className={decisiveButtonClass}
              >
                {t('reject_all')}
              </button>
              <button
                type="button"
                onClick={() => setPanelOpen(true)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-stone-600 underline underline-offset-2 transition-colors hover:text-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-stone-300 dark:hover:text-brand-400"
              >
                {t('manage')}
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal isOpen={panelOpen} onClose={() => setPanelOpen(false)} title={t('panel_title')} size="lg">
        <p className="text-sm text-stone-600 dark:text-stone-300">{t.rich('message', policyLinks)}</p>

        <div className="mt-5 space-y-3">
          <Category title={t('necessary_title')} description={t('necessary_desc')}>
            <span className="whitespace-nowrap rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300">
              {t('always_active')}
            </span>
          </Category>

          <Category title={t('preferences_title')} description={t('preferences_desc')}>
            {(labelId) => (
              <Switch
                checked={draft.preferences}
                labelId={labelId}
                onChange={(next) => setDraft((prev) => ({ ...prev, preferences: next }))}
              />
            )}
          </Category>

          <Category title={t('analytics_title')} description={t('analytics_desc')}>
            {(labelId) => (
              <Switch
                checked={draft.analytics}
                labelId={labelId}
                onChange={(next) => setDraft((prev) => ({ ...prev, analytics: next }))}
              />
            )}
          </Category>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" onClick={() => decide(draft)} className={decisiveButtonClass}>
            {t('save')}
          </button>
          <button type="button" onClick={() => decide(ACCEPT_ALL)} className={decisiveButtonClass}>
            {t('accept_all')}
          </button>
          <button
            type="button"
            onClick={() => decide(REJECT_NON_ESSENTIAL)}
            className={decisiveButtonClass}
          >
            {t('reject_all')}
          </button>
        </div>
      </Modal>
    </>
  );
}

/**
 * One category row. `children` may be a render function so the control can be
 * labelled by the row's own heading — an unlabelled switch reads as just "on"
 * to a screen reader.
 */
function Category({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode | ((labelId: string) => ReactNode);
}) {
  const labelId = useId();
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-stone-200 p-3 dark:border-stone-700">
      <div>
        <h3 id={labelId} className="text-sm font-medium text-stone-900 dark:text-white">
          {title}
        </h3>
        <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{description}</p>
      </div>
      <div className="flex-shrink-0 pt-0.5">
        {typeof children === 'function' ? children(labelId) : children}
      </div>
    </div>
  );
}

/**
 * The knob is positioned with flex alignment rather than a transform, so it
 * moves toward the correct edge in RTL without any direction-specific classes.
 */
function Switch({
  checked,
  labelId,
  onChange,
}: {
  checked: boolean;
  labelId: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      onClick={() => onChange(!checked)}
      className={`flex h-6 w-11 items-center rounded-full p-0.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
        checked ? 'justify-end bg-brand-600' : 'justify-start bg-stone-300 dark:bg-stone-600'
      }`}
    >
      <span className="h-5 w-5 rounded-full bg-white shadow transition-transform" />
    </button>
  );
}
