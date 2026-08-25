'use client';
import React, { useState, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useAuth } from '@/providers/AuthProvider';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import TemplatePreviewModal from '@/components/cv-builder/TemplatePreviewModal';
import ClassicLayout   from '@/components/cv-builder/templates/ClassicLayout';
import SidebarLayout   from '@/components/cv-builder/templates/SidebarLayout';
import TopBarLayout    from '@/components/cv-builder/templates/TopBarLayout';
import CompactLayout   from '@/components/cv-builder/templates/CompactLayout';
import SlateGoldLayout from '@/components/cv-builder/templates/SlateGoldLayout';
import { buildSampleCV, SAMPLE_SECTIONS } from '@/lib/previewSampleCV';
import {
  Lock,
  Star,
  Sparkles,
  LogIn,
  LayoutTemplate,
  ArrowRight,
  CheckCircle,
  Eye,
  Search,
  X,
  FileText,
  Pencil,
  Mail,
  Download,
} from 'lucide-react';
import {
  Template,
  TemplateCategory,
  SubscriptionPlan,
  resolveEffectivePlan,
  planMeetsTier,
  type CVLayout,
} from '@flacroncv/shared-types';
import { Link } from '@/i18n/routing';
import { PUBLIC_TEMPLATES_EN } from '@/content/public-templates';

/* ─── Constants ─── */

type CategoryFilter = 'all' | TemplateCategory;
type TierFilter = 'all' | SubscriptionPlan;

const PENDING_TEMPLATE_KEY = 'flacroncv_pending_template';

const tierVariantMap: Record<SubscriptionPlan, 'success' | 'brand' | 'warning' | 'info'> = {
  [SubscriptionPlan.FREE]: 'success',
  [SubscriptionPlan.PRO]: 'brand',
  [SubscriptionPlan.CAREER_ACCELERATOR]: 'info',
  [SubscriptionPlan.ENTERPRISE]: 'warning',
};

// Translation keys (resolved with t() at render) so badges localize per locale.
// (No built-in template is Career-Accelerator-tier — templates use free/pro/
// enterprise — but the maps must cover every plan for exhaustiveness.)
const tierKeyMap: Record<SubscriptionPlan, string> = {
  [SubscriptionPlan.FREE]: 'templates.free',
  [SubscriptionPlan.PRO]: 'templates.pro',
  [SubscriptionPlan.CAREER_ACCELERATOR]: 'templates.career_accelerator',
  [SubscriptionPlan.ENTERPRISE]: 'templates.enterprise',
};

/**
 * CANONICAL ENGLISH tier names — what `TemplatePreviewModal` expects.
 *
 * The modal derives its own translation key from this prop
 * (`tCommon(tierLabel.toLowerCase())`) and branches its icon on
 * `tierLabel === 'Enterprise' | 'Pro'`. Passing a LOCALIZED label therefore
 * breaks it: in Arabic it looked up `common.احترافي`, which exists nowhere, and
 * next-intl rendered that raw key path into the badge, the upgrade copy and the
 * perk list. Same contract as `cv/new/pick-template`, which also passes English.
 * The page's own badges keep using `tierKeyMap` and stay localized.
 */
const tierCanonicalMap: Record<SubscriptionPlan, string> = {
  [SubscriptionPlan.FREE]: 'Free',
  [SubscriptionPlan.PRO]: 'Pro',
  // No built-in template is Career-Accelerator tier, so this is unreachable
  // today; 'Pro' keeps the modal coherent rather than emitting a key it cannot
  // resolve, should the catalogue ever gain one.
  [SubscriptionPlan.CAREER_ACCELERATOR]: 'Pro',
  [SubscriptionPlan.ENTERPRISE]: 'Enterprise',
};

const categoryKeyMap: Record<TemplateCategory, string> = {
  [TemplateCategory.CV]: 'templates.categoryCv',
  [TemplateCategory.COVER_LETTER]: 'templates.categoryCoverLetter',
};

/* ─── Slug → layout/color mapping ─── */

const templateMeta: Record<string, { layout: CVLayout; color: string }> = {
  classic:       { layout: 'classic',    color: '#1e3a5f' },
  modern:        { layout: 'sidebar',    color: '#2563eb' },
  minimal:       { layout: 'classic',    color: '#374151' },
  professional:  { layout: 'top-bar',   color: '#0f766e' },
  creative:      { layout: 'top-bar',   color: '#7c3aed' },
  executive:     { layout: 'compact',   color: '#0c0c0c' },
  compact:       { layout: 'compact',   color: '#1d4ed8' },
  'two-column':  { layout: 'sidebar',    color: '#059669' },
  academic:      { layout: 'classic',    color: '#6b21a8' },
  bold:          { layout: 'top-bar',   color: '#dc2626' },
  'slate-gold':  { layout: 'slate-gold', color: '#C9A84C' },
};

/* ─── Real template thumbnail ─── */

function CVTemplateThumbnail({ slug }: { slug: string }) {
  const meta = templateMeta[slug];
  if (!meta) return null;

  const cv       = buildSampleCV(meta.layout, meta.color);
  const sections = SAMPLE_SECTIONS;

  let LayoutComponent: React.ComponentType<{ cv: typeof cv; sections: typeof sections }>;
  switch (meta.layout) {
    case 'sidebar':    LayoutComponent = SidebarLayout;   break;
    case 'top-bar':    LayoutComponent = TopBarLayout;    break;
    case 'compact':    LayoutComponent = CompactLayout;   break;
    case 'slate-gold': LayoutComponent = SlateGoldLayout; break;
    default:           LayoutComponent = ClassicLayout;   break;
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: '50%',
        width: '794px',
        transformOrigin: 'top center',
        transform: 'translateX(-50%) scale(var(--thumb-scale, 0.33))',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
      // Responsive scale: matches grid breakpoints (xl=4col, lg=3col, sm=2col, 1col)
      className="[--thumb-scale:0.44] sm:[--thumb-scale:0.60] lg:[--thumb-scale:0.45] xl:[--thumb-scale:0.34]"
    >
      <LayoutComponent cv={cv} sections={sections} />
    </div>
  );
}

/* ─── Cover-letter placeholder thumbnail ─── */

function CLPlaceholderThumbnail({ color }: { color: string }) {
  return (
    <div className="flex h-full w-full flex-col gap-2 bg-white p-5">
      <div className="h-3 w-1/2 rounded" style={{ background: color }} />
      <div className="h-1.5 w-1/3 rounded bg-stone-200" />
      <div className="mt-3 h-px w-full bg-stone-200" />
      <div className="mt-1 space-y-1.5">
        {[100, 95, 100, 80, 100, 70].map((w, i) => (
          <div key={i} className="rounded bg-stone-100" style={{ height: 6, width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}

/* ─── Skeleton card ─── */

function SkeletonCard() {
  return (
    <Card padding="none" className="flex flex-col animate-pulse overflow-hidden">
      <div className="h-52 bg-stone-200 dark:bg-stone-700 shrink-0" />
      <div className="flex flex-1 flex-col justify-between p-4">
        <div className="space-y-3">
          <div className="h-5 w-2/3 rounded bg-stone-200 dark:bg-stone-700" />
          <div className="flex gap-2">
            <div className="h-5 w-14 rounded-full bg-stone-200 dark:bg-stone-700" />
            <div className="h-5 w-14 rounded-full bg-stone-200 dark:bg-stone-700" />
          </div>
        </div>
        <div className="h-9 w-full rounded-lg bg-stone-200 dark:bg-stone-700" />
      </div>
    </Card>
  );
}

function CopyCard({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex gap-4 rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div>
        <h3 className="font-semibold text-stone-900 dark:text-white">{title}</h3>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{desc}</p>
      </div>
    </div>
  );
}

/* ─── Main page ─── */

export default function PublicTemplatesPage(): React.JSX.Element | null {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { user } = useAuth();

  const [search, setSearch]                 = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [tierFilter, setTierFilter]         = useState<TierFilter>('all');
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);

  const { data: templates, isLoading, isError } = useQuery({
    queryKey: ['public-templates'],
    queryFn: () => api.get<Template[]>('/templates'),
    retry: 1,
  });

  // Only the fields the template model actually has are filterable: name/description
  // (search), category (document type) and tier. There is deliberately no industry or
  // career-level filter — those fields do not exist on the Template model.
  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    const query = search.trim().toLowerCase();
    return templates.filter((tmpl) => {
      if (categoryFilter !== 'all' && tmpl.category !== categoryFilter) return false;
      if (tierFilter !== 'all' && tmpl.tier !== tierFilter) return false;
      if (query) {
        const haystack = `${tmpl.name ?? ''} ${tmpl.description ?? ''}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [templates, search, categoryFilter, tierFilter]);

  const hasActiveFilters = search.trim() !== '' || categoryFilter !== 'all' || tierFilter !== 'all';

  const resetFilters = () => {
    setSearch('');
    setCategoryFilter('all');
    setTierFilter('all');
  };

  const userPlan = resolveEffectivePlan(user?.subscription);

  const canUseTemplate = (template: Template): boolean => {
    if (!user) return false;
    return planMeetsTier(userPlan, template.tier);
  };

  const handleUseTemplate = (template: Template) => {
    if (!user) {
      try {
        localStorage.setItem(
          PENDING_TEMPLATE_KEY,
          JSON.stringify({ templateId: template.id, category: template.category }),
        );
      } catch {
        // localStorage unavailable — proceed anyway
      }
      toast.info(t('public_templates.signin_required'));
      router.push('/login');
      return;
    }

    if (!canUseTemplate(template)) {
      toast.error(t('templates.upgradePlanMessage'));
      router.push('/settings/billing');
      return;
    }

    if (template.category === TemplateCategory.CV) {
      router.push(`/cv/new?template=${template.id}`);
    } else {
      router.push(`/cover-letters/new?template=${template.id}`);
    }
  };

  const categoryTabs: { value: CategoryFilter; label: string }[] = [
    { value: 'all', label: t('templates.allTemplates') },
    { value: TemplateCategory.CV, label: t('templates.cvTemplates') },
    { value: TemplateCategory.COVER_LETTER, label: t('templates.coverLetterTemplates') },
  ];

  const tierOptions: { value: TierFilter; label: string }[] = [
    { value: 'all', label: t('templates.allTiers') },
    { value: SubscriptionPlan.FREE, label: t('templates.free') },
    { value: SubscriptionPlan.PRO, label: t('templates.pro') },
    { value: SubscriptionPlan.ENTERPRISE, label: t('templates.enterprise') },
  ];

  // Derive modal props from previewTemplate
  const previewMeta     = previewTemplate ? templateMeta[previewTemplate.slug] : null;
  const previewLayout   = previewMeta?.layout ?? 'classic';
  const previewColor    = previewMeta?.color ?? '#2563eb';
  const previewIsPro    = previewTemplate ? previewTemplate.tier !== SubscriptionPlan.FREE : false;
  // Canonical English — see tierCanonicalMap. Do NOT localize this.
  const previewTierLabel = previewTemplate ? tierCanonicalMap[previewTemplate.tier] : 'Pro';
  const previewAccess   = previewTemplate ? canUseTemplate(previewTemplate) : false;

  return (
    <>
      {/* Hero */}
      <section className="border-b border-stone-200 bg-gradient-to-b from-stone-50 to-white dark:border-stone-800 dark:from-stone-900 dark:to-black">
        <div className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight text-stone-900 dark:text-white sm:text-5xl">
            {t('public_templates.title')}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-stone-600 dark:text-stone-400">
            {t('public_templates.subtitle')}
          </p>
        </div>
      </section>

      {locale === 'en' && (
        <>
          <section className="border-b border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-950">
            <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
              <h2 className="mb-2 text-center text-2xl font-bold text-stone-900 dark:text-white">
                {PUBLIC_TEMPLATES_EN.mid_title}
              </h2>
              <p className="mb-10 text-center text-stone-500 dark:text-stone-400">
                {PUBLIC_TEMPLATES_EN.mid_subtitle}
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <CopyCard
                  icon={FileText}
                  title={PUBLIC_TEMPLATES_EN.mid1_title}
                  desc={PUBLIC_TEMPLATES_EN.mid1_desc}
                />
                <CopyCard
                  icon={Pencil}
                  title={PUBLIC_TEMPLATES_EN.mid2_title}
                  desc={PUBLIC_TEMPLATES_EN.mid2_desc}
                />
                <CopyCard
                  icon={Mail}
                  title={PUBLIC_TEMPLATES_EN.mid3_title}
                  desc={PUBLIC_TEMPLATES_EN.mid3_desc}
                />
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
            <h2 className="mb-2 text-center text-2xl font-bold text-stone-900 dark:text-white">
              {PUBLIC_TEMPLATES_EN.close_title}
            </h2>
            <p className="mb-10 text-center text-stone-500 dark:text-stone-400">
              {PUBLIC_TEMPLATES_EN.close_subtitle}
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <CopyCard
                icon={LayoutTemplate}
                title={PUBLIC_TEMPLATES_EN.close1_title}
                desc={PUBLIC_TEMPLATES_EN.close1_desc}
              />
              <CopyCard
                icon={Sparkles}
                title={PUBLIC_TEMPLATES_EN.close2_title}
                desc={PUBLIC_TEMPLATES_EN.close2_desc}
              />
              <CopyCard
                icon={Download}
                title={PUBLIC_TEMPLATES_EN.close3_title}
                desc={PUBLIC_TEMPLATES_EN.close3_desc}
              />
            </div>
          </section>
        </>
      )}

      {/* Content */}
      <section className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
        {/* Keeps the outline h1 -> h2 -> h3 (card titles are h3) */}
        <h2 className="sr-only">{t('public_templates.results_heading')}</h2>
        {/* Search */}
        <div className="relative max-w-xl">
          <label htmlFor="template-search" className="sr-only">
            {t('public_templates.search_label')}
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
          />
          <input
            id="template-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('public_templates.search_placeholder')}
            className="w-full rounded-lg border border-stone-300 bg-white py-2 pe-10 ps-9 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-stone-600 dark:bg-stone-800 dark:text-white dark:placeholder:text-stone-500 [&::-webkit-search-cancel-button]:hidden"
          />
          {search !== '' && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label={t('public_templates.clear_search')}
              className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-stone-700 dark:hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Document type (CV / cover letter) */}
          <div className="flex rounded-lg border border-stone-200 bg-stone-50 p-1 dark:border-stone-700 dark:bg-stone-800/50">
            {categoryTabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setCategoryFilter(tab.value)}
                aria-pressed={categoryFilter === tab.value}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                  categoryFilter === tab.value
                    ? 'bg-white font-bold text-stone-900 shadow-sm dark:bg-stone-700 dark:text-white'
                    : 'font-medium text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tier filter */}
          <div className="flex items-center gap-2">
            <label
              htmlFor="tier-filter"
              className="text-sm font-medium text-stone-600 dark:text-stone-400"
            >
              {t('templates.tier')}
            </label>
            <select
              id="tier-filter"
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value as TierFilter)}
              className="input-field py-1.5 text-sm"
            >
              {tierOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Result count (announced when filters change) */}
        {!isLoading && !isError && (
          <div className="flex flex-wrap items-center gap-3">
            <p aria-live="polite" className="text-sm text-stone-500 dark:text-stone-400">
              {t('public_templates.results_count', {
                count: filteredTemplates.length,
                total: templates?.length ?? 0,
              })}
            </p>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                {t('templates.clearFilters')}
              </Button>
            )}
          </div>
        )}

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : isError ? (
          <Card className="flex flex-col items-center justify-center py-20 text-center">
            <LayoutTemplate className="mb-4 h-12 w-12 text-stone-300 dark:text-stone-600" />
            <h3 className="text-lg font-semibold text-stone-900 dark:text-white">
              {t('common.error')}
            </h3>
            <p className="mt-2 max-w-sm text-sm text-stone-500 dark:text-stone-400">
              {t('public_templates.load_error')}
            </p>
          </Card>
        ) : filteredTemplates.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredTemplates.map((template) => {
              const isLocked  = user ? !canUseTemplate(template) : false;
              const isCVTemplate = template.category === TemplateCategory.CV;
              const accentColor  = templateMeta[template.slug]?.color ?? '#2563eb';

              return (
                <Card
                  key={template.id}
                  padding="none"
                  hover
                  className="group relative flex flex-col overflow-hidden"
                >
                  {/* Whole-card preview trigger. A real <button> stretched over the
                      card (rather than a click handler on the card) keeps it a single
                      keyboard stop with Enter/Space handled natively, and leaves the
                      primary action button below un-nested and independently focusable. */}
                  <button
                    type="button"
                    onClick={() => setPreviewTemplate(template)}
                    className="absolute inset-0 z-10 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                  >
                    <span className="sr-only">
                      {t('template_picker.preview_aria', { name: template.name })}
                    </span>
                  </button>

                  {/* Thumbnail */}
                  <div className="relative shrink-0">
                    <div className="relative h-52 overflow-hidden bg-white dark:bg-stone-950">

                      {/* Real template render (CV) or simple placeholder (Cover Letter) */}
                      {isCVTemplate ? (
                        <CVTemplateThumbnail slug={template.slug} />
                      ) : (
                        <CLPlaceholderThumbnail color={accentColor} />
                      )}

                      {/* Lock overlay */}
                      {isLocked && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
                          <div className="flex items-center gap-2 rounded-full bg-black/50 px-4 py-2 text-sm font-semibold text-white">
                            <Lock className="h-4 w-4" />
                            {t(tierKeyMap[template.tier])}
                          </div>
                        </div>
                      )}

                      {/* Featured badge */}
                      {template.isFeatured && (
                        <div className="absolute end-3 top-3">
                          <div className="flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
                            <Star className="h-3 w-3 fill-current" />
                            {t('templates.featured')}
                          </div>
                        </div>
                      )}

                      {/* Hover/focus preview hint — decorative: the stretched button
                          above owns the interaction and carries the accessible name. */}
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition-all group-hover:bg-black/25 group-focus-within:bg-black/25"
                      >
                        <span className="flex translate-y-2 items-center gap-1.5 rounded-full bg-white/95 px-4 py-1.5 text-xs font-semibold text-stone-800 opacity-0 shadow-md transition-all group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
                          <Eye className="h-3.5 w-3.5" />
                          {t('public_templates.preview')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card content */}
                  <div className="flex flex-1 flex-col justify-between gap-3 p-4">
                    <div className="space-y-2">
                      <div>
                        <h3 className="font-semibold text-stone-900 dark:text-white">
                          {template.name}
                        </h3>
                        <p className="mt-1 line-clamp-2 text-xs text-stone-500 dark:text-stone-400">
                          {template.description}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="default">{t(categoryKeyMap[template.category])}</Badge>
                        <Badge variant={tierVariantMap[template.tier]}>
                          {t(tierKeyMap[template.tier])}
                        </Badge>
                      </div>
                    </div>

                    {/* Action buttons — above the stretched preview trigger so they
                        keep their own click targets (explicit affordance on touch,
                        where there is no hover state to reveal the preview hint). */}
                    <div className="relative z-20 flex flex-col gap-2">
                      <Button
                        className="w-full"
                        variant="ghost"
                        size="sm"
                        icon={<Eye className="h-4 w-4" />}
                        onClick={() => setPreviewTemplate(template)}
                      >
                        {t('public_templates.preview')}
                      </Button>
                      {!user ? (
                        <Button
                          className="w-full"
                          variant="primary"
                          size="sm"
                          icon={<LogIn className="h-4 w-4 rtl:-scale-x-100" />}
                          onClick={() => handleUseTemplate(template)}
                        >
                          {t('public_templates.login_to_use')}
                        </Button>
                      ) : isLocked ? (
                        <Button
                          className="w-full"
                          variant="secondary"
                          size="sm"
                          icon={<Lock className="h-4 w-4" />}
                          onClick={() => handleUseTemplate(template)}
                        >
                          {t('public_templates.buy_template')}
                        </Button>
                      ) : (
                        <Button
                          className="w-full"
                          variant="primary"
                          size="sm"
                          icon={<Sparkles className="h-4 w-4" />}
                          onClick={() => handleUseTemplate(template)}
                        >
                          {t('public_templates.use_template')}
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="flex flex-col items-center justify-center py-20 text-center">
            <LayoutTemplate className="mb-4 h-12 w-12 text-stone-300 dark:text-stone-600" />
            <h3 className="text-lg font-semibold text-stone-900 dark:text-white">
              {t('templates.noTemplates')}
            </h3>
            <p className="mt-1 max-w-sm text-sm text-stone-500 dark:text-stone-400">
              {t('templates.noTemplatesDescription')}
            </p>
            {hasActiveFilters && (
              <Button variant="secondary" size="sm" className="mt-4" onClick={resetFilters}>
                {t('templates.clearFilters')}
              </Button>
            )}
          </Card>
        )}
      </section>

      {/* CTA */}
      <section className="border-t border-stone-200 bg-gradient-to-br from-brand-600 to-brand-700 dark:border-stone-800">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white">
            {t('public_templates.cta_title')}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-brand-50">
            {t('public_templates.cta_subtitle')}
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            {user ? (
              <Link href="/cv/new">
                <Button
                  variant="secondary"
                  size="lg"
                  icon={<ArrowRight className="h-5 w-5 rtl:rotate-180" />}
                  className="bg-white text-brand-600 hover:bg-brand-50"
                >
                  {t('dashboard.create_cv')}
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/register">
                  <Button
                    size="lg"
                    icon={<CheckCircle className="h-5 w-5" />}
                    className="bg-white text-brand-700 hover:bg-brand-50"
                  >
                    {t('public_templates.cta_btn')}
                  </Button>
                </Link>
                <Link href="/login">
                  <Button variant="ghost" size="lg" className="text-white hover:bg-white/10">
                    {t('public_templates.cta_login')}
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {locale === 'en' && (
        <section className="border-b border-stone-200 bg-white py-12 dark:border-stone-800 dark:bg-stone-950">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <p className="text-stone-600 dark:text-stone-400">{PUBLIC_TEMPLATES_EN.related_title}</p>
            <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-8">
              <Link
                href="/ai-cv-builder"
                locale="en"
                className="text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
              >
                {PUBLIC_TEMPLATES_EN.related_cv_cta}
              </Link>
              <Link
                href="/ai-cover-letter-generator"
                locale="en"
                className="text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
              >
                {PUBLIC_TEMPLATES_EN.related_letter_cta}
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Full-screen preview modal — uses real template renderer */}
      {previewTemplate && (
        <TemplatePreviewModal
          isOpen={true}
          onClose={() => setPreviewTemplate(null)}
          templateName={previewTemplate.name}
          layout={previewLayout}
          accentColor={previewColor}
          isPro={previewIsPro}
          tierLabel={previewTierLabel}
          userCanAccess={previewAccess}
          onSelect={() => {
            setPreviewTemplate(null);
            handleUseTemplate(previewTemplate);
          }}
        />
      )}
    </>
  );
}
