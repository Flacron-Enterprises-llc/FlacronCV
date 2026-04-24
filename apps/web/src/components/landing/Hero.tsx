'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import Button from '@/components/ui/Button';
import {
  Sparkles,
  CheckCircle2,
  Undo2,
  Redo2,
  Download,
  Save,
  GripVertical,
  Plus,
  Zap,
  Star,
  TrendingUp,
  User,
  Briefcase,
  GraduationCap,
  Wrench,
} from 'lucide-react';
import { useInView } from '@/hooks/useInView';
import { useAuth } from '@/providers/AuthProvider';

/* ─── Micro-components for the mockup ─── */

function ToolbarBtn({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <div
      className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors ${
        active
          ? 'bg-brand-600 text-white'
          : 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300'
      }`}
    >
      {children}
    </div>
  );
}

function SectionHeader({ icon: Icon, label, color = 'brand' }: { icon: React.ElementType; label: string; color?: string }) {
  const colorMap: Record<string, string> = {
    brand: 'text-brand-600 bg-brand-50 dark:bg-brand-950 dark:text-brand-400',
    violet: 'text-violet-600 bg-violet-50 dark:bg-violet-950 dark:text-violet-400',
    emerald: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400',
    amber: 'text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400',
  };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-stone-200/80 bg-white px-3 py-2.5 shadow-sm dark:border-stone-700/80 dark:bg-stone-800">
      <div className={`flex h-6 w-6 items-center justify-center rounded-md ${colorMap[color]}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <span className="text-[12px] font-semibold text-stone-700 dark:text-stone-200">{label}</span>
      <div className="ms-auto flex h-5 w-5 items-center justify-center rounded bg-stone-100 dark:bg-stone-700">
        <GripVertical className="h-3 w-3 text-stone-400" />
      </div>
    </div>
  );
}

function FieldRow({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <p className="mb-0.5 text-[9px] font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500">{label}</p>
      <div className="flex items-center rounded-md border border-stone-200 bg-stone-50 px-2 py-1.5 text-[11px] text-stone-700 dark:border-stone-600 dark:bg-stone-700/60 dark:text-stone-300">
        {value}
      </div>
    </div>
  );
}

function SkillPill({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-[10px] font-medium text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300">
      {label}
    </span>
  );
}

function AiGlow() {
  return (
    <div className="animate-pulse-slow flex items-center gap-1.5 rounded-full border border-violet-200 bg-gradient-to-r from-brand-50 to-violet-50 px-3 py-1.5 shadow-sm dark:border-violet-800 dark:from-brand-950 dark:to-violet-950">
      <Sparkles className="h-3.5 w-3.5 text-violet-500" />
      <span className="text-[11px] font-semibold text-violet-700 dark:text-violet-300">AI writing your summary…</span>
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1 w-1 rounded-full bg-violet-400"
            style={{ animationDelay: `${i * 200}ms`, animation: 'bounce 1.2s infinite' }}
          />
        ))}
      </span>
    </div>
  );
}

/* ─── Left editor panel ─── */
function EditorPanel() {
  return (
    <div className="hidden h-full w-[46%] shrink-0 flex-col gap-2.5 overflow-hidden border-e border-stone-200 bg-stone-50 p-3.5 sm:flex dark:border-stone-700 dark:bg-stone-900/60">
      {/* Personal Info */}
      <SectionHeader icon={User} label="Personal Info" color="brand" />
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-stone-200/60 bg-white p-3 shadow-sm dark:border-stone-700/60 dark:bg-stone-800/50">
        <FieldRow label="Full Name" value="Alex Johnson" wide />
        <FieldRow label="Job Title" value="Senior Engineer" />
        <FieldRow label="Email" value="alex@email.com" />
        <FieldRow label="Location" value="New York, NY" />
        <FieldRow label="Phone" value="+1 (555) 012-3456" />
        <FieldRow label="LinkedIn" value="linkedin.com/in/alex" />
      </div>

      {/* Experience */}
      <SectionHeader icon={Briefcase} label="Work Experience" color="violet" />
      <div className="rounded-xl border border-stone-200/60 bg-white p-3 shadow-sm dark:border-stone-700/60 dark:bg-stone-800/50">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <p className="text-[11px] font-bold text-stone-800 dark:text-stone-100">Senior Software Engineer</p>
            <p className="text-[10px] text-brand-600 dark:text-brand-400">Google · 2021 – Present</p>
            <div className="mt-1.5 space-y-1">
              {['Led a team of 12 engineers across 3 time zones', 'Reduced API latency by 40% through caching'].map((b, i) => (
                <p key={i} className="flex gap-1.5 text-[10px] leading-tight text-stone-500 dark:text-stone-400">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                  {b}
                </p>
              ))}
            </div>
          </div>
        </div>
        <button className="mt-2 flex items-center gap-1 text-[10px] font-medium text-brand-600 dark:text-brand-400">
          <Plus className="h-3 w-3" /> Add bullet
        </button>
      </div>

      {/* Skills */}
      <SectionHeader icon={Wrench} label="Skills" color="emerald" />
      <div className="rounded-xl border border-stone-200/60 bg-white p-3 shadow-sm dark:border-stone-700/60 dark:bg-stone-800/50">
        <div className="flex flex-wrap gap-1.5">
          {['React', 'Node.js', 'TypeScript', 'Python', 'AWS', 'Docker'].map((s) => (
            <SkillPill key={s} label={s} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Right CV preview panel ─── */
function PreviewPanel() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-stone-100 p-3 dark:bg-stone-950">
      {/* Paper shadow CV */}
      <div className="mx-auto w-full max-w-[220px] overflow-hidden rounded-lg bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12)] ring-1 ring-stone-200 dark:ring-stone-700">
        {/* CV header */}
        <div className="bg-gradient-to-r from-stone-900 to-stone-800 px-4 py-3.5">
          <h2 className="text-[13px] font-bold tracking-wide text-white">ALEX JOHNSON</h2>
          <p className="text-[9px] font-medium tracking-widest text-stone-300">SENIOR SOFTWARE ENGINEER</p>
          <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
            {['alex@email.com', 'New York, NY', 'linkedin.com/in/alex'].map((c) => (
              <span key={c} className="text-[8px] text-stone-400">{c}</span>
            ))}
          </div>
        </div>

        <div className="p-3 space-y-2.5">
          {/* Summary */}
          <div>
            <div className="mb-1 flex items-center gap-1.5">
              <span className="text-[8px] font-bold uppercase tracking-widest text-brand-600">Summary</span>
              <div className="h-px flex-1 bg-brand-200" />
            </div>
            <div className="space-y-0.5">
              <div className="h-1 w-full rounded-full bg-stone-200" />
              <div className="h-1 w-4/5 rounded-full bg-stone-200" />
              <div className="h-1 w-5/6 rounded-full bg-stone-200" />
            </div>
          </div>

          {/* Experience */}
          <div>
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="text-[8px] font-bold uppercase tracking-widest text-brand-600">Experience</span>
              <div className="h-px flex-1 bg-brand-200" />
            </div>
            <div className="space-y-2">
              {[
                { role: 'Senior Software Engineer', co: 'Google', dates: '2021 – Present' },
                { role: 'Software Engineer', co: 'Stripe', dates: '2019 – 2021' },
              ].map((exp) => (
                <div key={exp.co}>
                  <p className="text-[9px] font-bold text-stone-800">{exp.role}</p>
                  <p className="text-[8px] font-medium text-brand-600">{exp.co} · {exp.dates}</p>
                  <div className="mt-1 space-y-0.5">
                    <div className="h-[3px] w-full rounded-full bg-stone-100" />
                    <div className="h-[3px] w-5/6 rounded-full bg-stone-100" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Education */}
          <div>
            <div className="mb-1 flex items-center gap-1.5">
              <span className="text-[8px] font-bold uppercase tracking-widest text-brand-600">Education</span>
              <div className="h-px flex-1 bg-brand-200" />
            </div>
            <p className="text-[9px] font-bold text-stone-800">BSc Computer Science</p>
            <p className="text-[8px] text-stone-500">MIT · 2015 – 2019</p>
          </div>

          {/* Skills */}
          <div>
            <div className="mb-1 flex items-center gap-1.5">
              <span className="text-[8px] font-bold uppercase tracking-widest text-brand-600">Skills</span>
              <div className="h-px flex-1 bg-brand-200" />
            </div>
            <div className="flex flex-wrap gap-1">
              {['React', 'Node.js', 'TypeScript', 'Python', 'AWS'].map((s) => (
                <span key={s} className="rounded bg-brand-50 px-1 py-0.5 text-[7px] font-medium text-brand-700">
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Floating stat cards ─── */
function FloatingCard({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`absolute z-20 rounded-xl border border-white/80 bg-white/95 px-3 py-2.5 shadow-xl backdrop-blur-sm dark:border-stone-700/80 dark:bg-stone-800/95 ${className}`}
    >
      {children}
    </div>
  );
}

/* ─── Main Hero ─── */
export default function Hero() {
  const t = useTranslations();
  const { user } = useAuth();
  const { ref: contentRef, isInView: contentInView } = useInView({ threshold: 0.1 });
  const { ref: mockupRef, isInView: mockupInView } = useInView({ threshold: 0.05 });
  // Authenticated users skip the register page entirely and land in the app.
  const primaryHref = user ? '/dashboard' : '/register';

  return (
    <section className="relative overflow-hidden pt-16">
      {/* Background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-brand-50/60 via-white to-white dark:from-stone-950 dark:via-stone-950 dark:to-stone-950" />
        <div className="absolute left-1/4 top-0 -z-10 h-[500px] w-[500px] -translate-y-1/3 rounded-full bg-brand-400/10 blur-3xl dark:bg-brand-600/5" />
        <div className="absolute right-1/4 top-0 -z-10 h-[400px] w-[400px] -translate-y-1/3 rounded-full bg-violet-400/10 blur-3xl dark:bg-violet-600/5" />
      </div>

      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-32">
        {/* Hero copy */}
        <div
          ref={contentRef}
          className={`mx-auto max-w-3xl text-center transition-all duration-700 ${contentInView ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}
        >
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 shadow-sm dark:border-brand-800 dark:bg-brand-950/50 dark:text-brand-300">
            <Sparkles className="h-4 w-4" />
            <span>{t('hero.badge')}</span>
          </div>

          {/* Headline */}
          <h1 className="mb-6 text-4xl font-extrabold tracking-tight text-stone-900 sm:text-5xl lg:text-6xl dark:text-white">
            {t('hero.title_part1')}{' '}
            <span className="bg-gradient-to-r from-brand-500 to-violet-600 bg-clip-text text-transparent">
              {t('hero.title_highlight')}
            </span>{' '}
            {t('hero.title_part2')}
          </h1>

          {/* Subtitle */}
          <p className="mb-8 text-lg text-stone-600 sm:text-xl dark:text-stone-400">
            {t('hero.subtitle')}
          </p>

          {/* CTAs */}
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href={primaryHref}>
              <Button variant="gradient" size="lg">
                {t('hero.cta_primary')}
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
            >
              {t('hero.cta_secondary')} →
            </Button>
          </div>

          {/* Trust bar */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-stone-500 dark:text-stone-400">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              {t('hero.trust_free')}
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              {t('hero.trust_ats')}
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              {t('hero.trust_export')}
            </div>
          </div>
        </div>

        {/* ─── Dashboard Showcase ─── */}
        <div
          ref={mockupRef}
          className={`relative mx-auto mt-20 max-w-5xl transition-all duration-700 delay-300 ${mockupInView ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'}`}
        >
          {/* Ambient glow */}
          <div className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-r from-brand-400/20 via-violet-400/15 to-brand-400/20 blur-3xl" />

          {/* Floating stat: ATS Score */}
          <FloatingCard className="-top-5 left-6 hidden sm:block">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-white">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] font-medium text-stone-500 dark:text-stone-400">ATS Score</p>
                <p className="text-base font-bold text-stone-900 dark:text-white">94 / 100</p>
              </div>
            </div>
          </FloatingCard>

          {/* Floating stat: AI suggestion */}
          <FloatingCard className="-top-5 right-6 hidden sm:block">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500 text-white">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] font-medium text-stone-500 dark:text-stone-400">AI Suggestions</p>
                <p className="text-base font-bold text-stone-900 dark:text-white">3 ready</p>
              </div>
            </div>
          </FloatingCard>

          {/* Floating stat: interviews */}
          <FloatingCard className="-bottom-5 left-10 hidden sm:block">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-white">
                <Star className="h-4 w-4 fill-current" />
              </div>
              <div>
                <p className="text-[10px] font-medium text-stone-500 dark:text-stone-400">This week</p>
                <p className="text-[13px] font-bold text-stone-900 dark:text-white">3 interview calls 🎉</p>
              </div>
            </div>
          </FloatingCard>

          {/* Browser chrome */}
          <div className="overflow-hidden rounded-2xl border border-stone-300/60 bg-white shadow-[0_32px_80px_rgba(0,0,0,0.18)] dark:border-stone-700/60 dark:bg-stone-900">
            {/* Title bar */}
            <div className="flex items-center gap-3 border-b border-stone-200 bg-stone-100 px-4 py-2.5 dark:border-stone-700 dark:bg-stone-800">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-400 hover:bg-red-500" />
                <div className="h-3 w-3 rounded-full bg-amber-400 hover:bg-amber-500" />
                <div className="h-3 w-3 rounded-full bg-emerald-400 hover:bg-emerald-500" />
              </div>
              <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-md border border-stone-200 bg-white px-3 py-1 dark:border-stone-600 dark:bg-stone-700">
                <div className="mr-2 h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                <span className="truncate text-[11px] text-stone-400 dark:text-stone-500">app.flacroncv.com/cv/alex-johnson</span>
              </div>
            </div>

            {/* App toolbar */}
            <div className="flex items-center gap-2 border-b border-stone-200 bg-white px-4 py-2 dark:border-stone-700 dark:bg-stone-900">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white">
                <Zap className="h-3.5 w-3.5" />
              </div>
              <span className="me-2 hidden min-w-0 truncate text-[12px] font-bold text-stone-800 sm:inline dark:text-white">
                Alex Johnson — Senior Engineer <span className="ms-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Saved ✓</span>
              </span>
              <div className="ms-auto flex items-center gap-1.5">
                <div className="hidden sm:flex sm:items-center sm:gap-1.5">
                  <ToolbarBtn><Undo2 className="h-3 w-3" /></ToolbarBtn>
                  <ToolbarBtn><Redo2 className="h-3 w-3" /></ToolbarBtn>
                  <div className="mx-1 h-4 w-px bg-stone-200 dark:bg-stone-700" />
                </div>
                <ToolbarBtn active><Sparkles className="h-3 w-3" /> AI Assist</ToolbarBtn>
                <ToolbarBtn><Download className="h-3 w-3" /> Export</ToolbarBtn>
              </div>
            </div>

            {/* Editor body */}
            <div className="flex h-[300px] sm:h-[420px]">
              <EditorPanel />
              <PreviewPanel />
            </div>

            {/* Status bar */}
            <div className="flex items-center justify-between gap-2 border-t border-stone-200 bg-stone-50 px-3 py-1.5 sm:px-4 dark:border-stone-700 dark:bg-stone-800/50">
              <div className="flex min-w-0 items-center">
                <AiGlow />
              </div>
              <div className="hidden items-center gap-3 text-[10px] text-stone-400 sm:flex dark:text-stone-500">
                <span>4 sections</span>
                <span>·</span>
                <span>342 words</span>
                <span>·</span>
                <span className="font-medium text-emerald-500">ATS Ready</span>
              </div>
              <span className="text-[10px] font-medium text-emerald-500 sm:hidden">ATS Ready</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
