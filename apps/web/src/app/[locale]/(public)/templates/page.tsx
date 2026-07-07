'use client';
import React, { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
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
} from 'lucide-react';
import {
  Template,
  TemplateCategory,
  SubscriptionPlan,
  type CVLayout,
} from '@flacroncv/shared-types';
import { Link } from '@/i18n/routing';

/* ─── Constants ─── */

type CategoryFilter = 'all' | TemplateCategory;
type TierFilter = 'all' | SubscriptionPlan;

const PENDING_TEMPLATE_KEY = 'flacroncv_pending_template';

const tierVariantMap: Record<SubscriptionPlan, 'success' | 'brand' | 'warning'> = {
  [SubscriptionPlan.FREE]: 'success',
  [SubscriptionPlan.PRO]: 'brand',
  [SubscriptionPlan.ENTERPRISE]: 'warning',
};

const tierLabelMap: Record<SubscriptionPlan, string> = {
  [SubscriptionPlan.FREE]: 'Free',
  [SubscriptionPlan.PRO]: 'Pro',
  [SubscriptionPlan.ENTERPRISE]: 'Enterprise',
};

const categoryLabelMap: Record<TemplateCategory, string> = {
  [TemplateCategory.CV]: 'CV',
  [TemplateCategory.COVER_LETTER]: 'Cover Letter',
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

/* ─── Main page ─── */

export default function PublicTemplatesPage(): React.JSX.Element | null {
  const t = useTranslations();
  const router = useRouter();
  const { user } = useAuth();

  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [tierFilter, setTierFilter]         = useState<TierFilter>('all');
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);

  const { data: templates, isLoading, isError } = useQuery({
    queryKey: ['public-templates'],
    queryFn: () => api.get<Template[]>('/templates'),
    retry: 1,
  });

  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    return templates.filter((tmpl) => {
      if (categoryFilter !== 'all' && tmpl.category !== categoryFilter) return false;
      if (tierFilter !== 'all' && tmpl.tier !== tierFilter) return false;
      return true;
    });
  }, [templates, categoryFilter, tierFilter]);

  const userPlan = user?.subscription?.plan || SubscriptionPlan.FREE;

  const canUseTemplate = (template: Template): boolean => {
    if (!user) return false;
    const planOrder = [SubscriptionPlan.FREE, SubscriptionPlan.PRO, SubscriptionPlan.ENTERPRISE];
    return planOrder.indexOf(userPlan) >= planOrder.indexOf(template.tier);
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
      toast.info('Please sign in to use this template.');
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
  const previewTierLabel = previewTemplate ? tierLabelMap[previewTemplate.tier] : 'Pro';
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

      {/* Content */}
      <section className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Category tabs */}
          <div className="flex rounded-lg border border-stone-200 bg-stone-50 p-1 dark:border-stone-700 dark:bg-stone-800/50">
            {categoryTabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setCategoryFilter(tab.value)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  categoryFilter === tab.value
                    ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-white'
                    : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tier filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-stone-600 dark:text-stone-400">
              {t('templates.tier')}:
            </span>
            <select
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
              Could not load templates. Please try again later.
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
                  className="group flex flex-col overflow-hidden"
                >
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
                            {tierLabelMap[template.tier]}
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

                      {/* Hover preview hint */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all group-hover:bg-black/25">
                        <button
                          onClick={() => setPreviewTemplate(template)}
                          className="flex translate-y-2 items-center gap-1.5 rounded-full bg-white/95 px-4 py-1.5 text-xs font-semibold text-stone-800 opacity-0 shadow-md transition-all hover:bg-white group-hover:translate-y-0 group-hover:opacity-100"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          {t('public_templates.preview')}
                        </button>
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
                        <Badge variant="default">{categoryLabelMap[template.category]}</Badge>
                        <Badge variant={tierVariantMap[template.tier]}>
                          {tierLabelMap[template.tier]}
                        </Badge>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col gap-2">
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
                          icon={<LogIn className="h-4 w-4" />}
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
            {(categoryFilter !== 'all' || tierFilter !== 'all') && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setCategoryFilter('all');
                  setTierFilter('all');
                }}
              >
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
          <p className="mx-auto mt-4 max-w-xl text-lg text-brand-200">
            {t('public_templates.cta_subtitle')}
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            {user ? (
              <Link href="/cv/new">
                <Button
                  variant="secondary"
                  size="lg"
                  icon={<ArrowRight className="h-5 w-5" />}
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
                    className="bg-white text-brand-600 hover:bg-brand-50"
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
