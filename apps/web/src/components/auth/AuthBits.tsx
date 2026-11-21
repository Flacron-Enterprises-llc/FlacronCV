import type { ReactNode } from 'react';
import { Briefcase, FileText, GraduationCap } from 'lucide-react';

/** Classes for the full-width pill buttons on the auth pages (merged into Button via cn/twMerge). */
export const AUTH_PRIMARY_BTN = 'h-12 w-full rounded-full text-base shadow-lg shadow-brand-600/25';
export const AUTH_SECONDARY_BTN = 'h-12 w-full rounded-full text-[15px]';

/** Page heading: navy title, muted subtitle, centred on phones and in the card. */
export function AuthHeading({ title, subtitle, icon }: { title: string; subtitle?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="text-center">
      {icon ? <div className="mb-5 flex justify-center">{icon}</div> : null}
      <h1 className="text-[1.75rem] font-black leading-tight tracking-tight text-navy dark:text-white sm:text-3xl">{title}</h1>
      {subtitle ? <p className="mt-2 text-[15px] leading-relaxed text-stone-600 dark:text-stone-400">{subtitle}</p> : null}
    </div>
  );
}

/** "──── Or continue with ────" without a background patch, so it works on any surface. */
export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="my-7 flex items-center gap-4" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-stone-200 dark:bg-stone-700" />
      <span className="text-sm font-medium text-stone-500 dark:text-stone-400">{label}</span>
      <span className="h-px flex-1 bg-stone-200 dark:bg-stone-700" />
    </div>
  );
}

/** Round icon medallion used on the password and verify pages. */
export function AuthMedallion({ children, tone = 'brand' }: { children: ReactNode; tone?: 'brand' | 'success' }) {
  return (
    <span
      className={
        tone === 'success'
          ? 'flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/50 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-900/10'
          : 'flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-8 ring-brand-50/50 dark:bg-brand-950 dark:text-brand-400 dark:ring-brand-950/30'
      }
    >
      {children}
    </span>
  );
}

/** Build CV · Find Jobs · Grow Career — shown above the sign-up form. */
export function AuthFeatureRow({ labels }: { labels: [string, string, string] }) {
  const items = [
    { icon: FileText, label: labels[0], tone: 'bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400' },
    { icon: Briefcase, label: labels[1], tone: 'bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400' },
    { icon: GraduationCap, label: labels[2], tone: 'bg-sky-50 text-navy dark:bg-sky-950/40 dark:text-sky-300' },
  ];
  return (
    <ul className="mt-7 grid grid-cols-3 divide-x divide-stone-200 rtl:divide-x-reverse dark:divide-stone-700">
      {items.map(({ icon: Icon, label, tone }) => (
        <li key={label} className="flex flex-col items-center px-2 text-center">
          <span className={`flex h-12 w-12 items-center justify-center rounded-full ${tone}`}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="mt-2 text-sm font-bold leading-tight text-navy dark:text-white">{label}</span>
        </li>
      ))}
    </ul>
  );
}
