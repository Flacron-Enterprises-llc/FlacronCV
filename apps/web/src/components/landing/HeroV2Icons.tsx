/**
 * Subset of V2's homepage icons (flacroncv-v2 apps/web/src/components/public/HomeIcons.tsx),
 * copied for the ported hero (HeroV2); only the peach tint is mapped to V1's brand orange.
 * All decorative: aria-hidden.
 */
type IconProps = { className?: string };

/** Pastel tile + icon colour pairs shared by homepage tiles, chips, and cards. */
export const TINT = {
  blue: 'bg-[#eaf1fe] text-[#2563eb] dark:bg-[#15284a] dark:text-[#8db4ff]',
  // V1 brand orange instead of V2's #d63d00.
  peach: 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-400',
  teal: 'bg-[#e4f6f2] text-[#0f7a6c] dark:bg-[#0f2f2c] dark:text-[#5fd3c1]',
  violet: 'bg-[#f1edff] text-[#6447d1] dark:bg-[#251d48] dark:text-[#b3a2ff]',
  amber: 'bg-[#fff5dd] text-[#a8620a] dark:bg-[#33260c] dark:text-[#f5c56b]',
  pink: 'bg-[#ffebf1] text-[#c2255c] dark:bg-[#3a1424] dark:text-[#ff8fb3]',
} as const;

export type Tint = keyof typeof TINT;

export function IconArrowRight({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconBriefcase({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7" stroke="currentColor" strokeWidth="1.75" />
      <path d="M3 12h18" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

export function IconChart({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 19.5h16M7 16.5V10M12 16.5V7M17 16.5v-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function IconCheck({ className }: IconProps) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5 9.5 17 19 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconDocument({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5z" stroke="currentColor" strokeWidth="1.75" />
      <path d="M14 3.5V8h4.5M8 12h8M8 15.5h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function IconDownload({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconGraduation({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2.5 9 12 4.5 21.5 9 12 13.5 2.5 9z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M6.5 11v4.5c0 1.4 2.5 3 5.5 3s5.5-1.6 5.5-3V11M21.5 9v5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function IconLayers({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4 3.5 8.5 12 13l8.5-4.5L12 4z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}

export function IconSend({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 11.5 20 4l-5.5 16-3.2-6.3L4 11.5z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}

export function IconTarget({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="12" cy="12" r="1.25" fill="currentColor" />
    </svg>
  );
}
