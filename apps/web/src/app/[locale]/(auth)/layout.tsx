import { Link } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';
import { Briefcase, FileText, GraduationCap } from 'lucide-react';
import Logo from '@/components/ui/Logo';
import PoweredBy from '@/components/shared/PoweredBy';
import { AuthBottomWave, AuthTopWave, CvIllustration, PanelArcs, PanelSwoosh } from '@/components/auth/AuthArt';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('auth');
  // A second translator: `t` above is bound to the `auth` namespace, and the
  // copyright line belongs to `footer`.
  const tf = await getTranslations('footer');
  const features = [
    { icon: FileText, title: t('panel_feature_build_title'), desc: t('panel_feature_build_desc') },
    { icon: Briefcase, title: t('panel_feature_jobs_title'), desc: t('panel_feature_jobs_desc') },
    { icon: GraduationCap, title: t('panel_feature_grow_title'), desc: t('panel_feature_grow_desc') },
  ];
  return (
    <div className="flex min-h-screen bg-white dark:bg-stone-950">
      {/* Left: navy brand panel (desktop) — the same navy and orange as the logo and the mobile app. */}
      <aside className="relative hidden overflow-hidden bg-navy lg:flex lg:w-[46%] lg:flex-col">
        <div className="pointer-events-none absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-brand-500/15 blur-[110px]" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 h-[26rem] w-[26rem] rounded-full bg-sky-400/10 blur-[110px]" />
        <PanelArcs className="pointer-events-none absolute right-0 top-0 h-80 w-80 rtl:left-0 rtl:right-auto rtl:-scale-x-100" />
        <PanelSwoosh className="pointer-events-none absolute inset-x-0 bottom-0 h-20 w-full xl:h-24" />

        <div className="relative z-10 flex h-full flex-col px-12 pb-24 pt-10 xl:px-16">
          <Link href="/" className="inline-flex w-fit items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
            <Logo variant="on-dark" className="h-11" priority />
          </Link>

          <div className="my-auto max-w-lg py-10">
            <h2 className="text-4xl font-black leading-tight tracking-tight text-white xl:text-[2.75rem]">
              {t('panel_title')}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-white/70">{t('panel_subtitle')}</p>

            <CvIllustration className="mt-8 h-auto w-64 xl:w-72" blob="rgba(255,255,255,0.07)" glow={false} />

            <ul className="mt-8 space-y-5">
              {features.map(({ icon: Icon, title, desc }) => (
                <li key={title} className="flex items-start gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 ring-1 ring-brand-400/30">
                    <Icon className="h-5 w-5 text-brand-300" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block font-bold text-white">{title}</span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-white/60">{desc}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-1">
            <p className="text-sm text-white/50">
              &copy; {new Date().getFullYear()} FlacronCV. {tf('rights')}
            </p>
            <PoweredBy tone="dark" />
          </div>
        </div>
      </aside>

      {/* Right: the form.
          `lg:h-screen` + `overflow-y-auto` makes this column its own scroll
          container, and `m-auto` on the inner block centres it when there's
          room but keeps the top reachable when the form is taller than the
          viewport. Below lg the page scrolls naturally, framed by the brand
          curves like the mobile app. */}
      <main
        id="main-content"
        className="flex w-full flex-col overflow-y-auto lg:h-screen lg:w-[54%] lg:bg-stone-50 lg:dark:bg-stone-950"
      >
        <AuthTopWave className="block h-20 w-full shrink-0 lg:hidden" />
        <div className="m-auto w-full max-w-md px-5 pb-10 pt-2 lg:max-w-[30rem] lg:px-0 lg:py-12">
          <div className="mb-8 flex justify-center lg:hidden">
            <Link href="/" className="flex items-center">
              <Logo className="h-10" priority />
            </Link>
          </div>
          <div className="lg:rounded-3xl lg:border lg:border-stone-200/80 lg:bg-white lg:p-10 lg:shadow-xl lg:shadow-stone-900/[0.06] lg:dark:border-stone-800 lg:dark:bg-stone-900">
            {children}
          </div>
        </div>
        <AuthBottomWave className="mt-auto block h-14 w-full shrink-0 lg:hidden" />
      </main>
    </div>
  );
}
