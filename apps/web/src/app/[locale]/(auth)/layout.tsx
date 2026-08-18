import { Link } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';
import Logo from '@/components/ui/Logo';
import PoweredBy from '@/components/shared/PoweredBy';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('auth');
  // A second translator: `t` above is bound to the `auth` namespace, and the
  // copyright line belongs to `footer` (it was hardcoded English here until now
  // for exactly that reason — AUDIT_OPEN_FINDINGS.md).
  const tf = await getTranslations('footer');
  return (
    <div className="flex min-h-screen">
      {/* Left: Brand panel — refined near-black with a subtle brand glow (no loud gradient). */}
      <div className="relative hidden w-1/2 overflow-hidden bg-stone-950 p-12 lg:flex lg:flex-col lg:justify-center">
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand-600/20 blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-24 -right-16 h-96 w-96 rounded-full bg-brand-500/10 blur-[100px]" />

        {/* Logo grouped directly above the message (not pinned to the top), so
            the panel reads as one centred block instead of a large void between
            a small top-left logo and the headline. */}
        <div className="relative z-10">
          <Link href="/" className="mb-10 inline-flex items-center">
            <Logo variant="on-dark" className="h-24" priority />
          </Link>
          <h2 className="text-3xl font-semibold tracking-tight text-white">
            {t('panel_title')}
          </h2>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-stone-400">
            {t('panel_subtitle')}
          </p>
        </div>

        {/* Pinned to the bottom so it anchors the panel without forcing a gap. */}
        <div className="absolute inset-x-12 bottom-12 z-10 space-y-1">
          <p className="text-sm text-stone-500">
            &copy; {new Date().getFullYear()} FlacronCV. {tf('rights')}
          </p>
          <PoweredBy tone="dark" />
        </div>
      </div>

      {/* Right: Auth form.
          `lg:h-screen` + `overflow-y-auto` makes this column its own scroll
          container, and `m-auto` on the inner block centres it when there's
          room but — unlike `items-center` — keeps the top reachable when the
          form is taller than the viewport (previously the top was clipped and
          unscrollable). Below lg the column has no fixed height and the page
          scrolls naturally. */}
      <main id="main-content" className="flex w-full flex-col overflow-y-auto px-4 py-12 lg:h-screen lg:w-1/2">
        <div className="m-auto w-full max-w-md">
          {/* Mobile logo */}
          <div className="mb-8 flex justify-center lg:hidden">
            <Link href="/" className="flex items-center">
              <Logo className="h-9" priority />
            </Link>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
