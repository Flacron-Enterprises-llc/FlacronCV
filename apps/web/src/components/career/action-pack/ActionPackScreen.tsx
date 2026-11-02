'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  isApiError,
  newIdempotencyKey,
  type ActionPack,
  type ActionPackBalanceView,
  type ApiClient,
  type OpportunityItem,
} from '@flacroncv/career-api-client';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PermissionDeniedState,
  ProviderUnavailableState,
} from '@/components/career/ui';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { profileLoadFailure } from '@/lib/career/profile-load';

const FIT_TONES: Record<string, 'neutral' | 'recommended' | 'later' | 'draft' | 'confirmed' | 'submitted'> = {
  strong: 'confirmed',
  partial: 'recommended',
  possible: 'recommended',
  none: 'neutral',
  blocked: 'draft',
};

export function ActionPackScreen({
  api,
  user,
  ready,
  signInHref,
}: {
  api: ApiClient;
  user: SignedInUser | null;
  ready: boolean;
  signInHref: string;
}) {
  const t = useTranslations('career.actionPack');
  const [load, setLoad] = useState<'loading' | 'permission' | 'unavailable' | 'signed-out' | 'ready'>('loading');
  const [packs, setPacks] = useState<ActionPack[]>([]);
  const [balance, setBalance] = useState<ActionPackBalanceView | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityItem[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedOppId, setSelectedOppId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoad('loading');
    setErrorMessage(null);
    try {
      const [packRes, oppRes] = await Promise.all([
        api.actionPacks(),
        api.opportunities({ q: '' }),
      ]);
      setPacks(packRes.items);
      setBalance(packRes.actionPack);
      setOpportunities(oppRes.items);
      setSelectedPackId((curr) => curr || (packRes.items.length > 0 ? packRes.items[0].id : null));
      setLoad('ready');
    } catch (error) {
      const failure = profileLoadFailure(error);
      setLoad(failure === 'signed-out' ? 'signed-out' : failure === 'permission' ? 'permission' : 'unavailable');
    }
  }, [api]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setLoad('signed-out');
      return;
    }
    void loadData();
  }, [ready, user, loadData]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOppId) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const key = newIdempotencyKey();
      const res = await api.createActionPack({ opportunityId: selectedOppId }, key);
      setPacks((prev) => [res.actionPack, ...prev]);
      setSelectedPackId(res.actionPack.id);
      setIsGenerating(false);
      setSelectedOppId('');
      if (balance) {
        setBalance({
          ...balance,
          includedRemaining: res.usage.includedRemaining,
          packRemaining: res.usage.packRemaining,
        });
      }
    } catch (error) {
      if (isApiError(error, 'plan_upgrade_required')) {
        setErrorMessage(t('plan_upgrade_required'));
      } else if (isApiError(error, 'quota_exhausted')) {
        setErrorMessage(t('quota_exhausted'));
      } else if (isApiError(error, 'feature_unavailable')) {
        setErrorMessage(t('feature_unavailable'));
      } else if (isApiError(error, 'validation_error')) {
        setErrorMessage(t('validation_error'));
      } else {
        setErrorMessage(t('generate_failed'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleChecklistToggle = async (packId: string, checklistId: string, currentDone: boolean) => {
    try {
      const updated = await api.updateActionPackChecklist(packId, checklistId, !currentDone);
      setPacks((prev) => prev.map((p) => (p.id === packId ? updated : p)));
    } catch {
      setErrorMessage(t('checklist_update_failed'));
    }
  };

  if (!ready || load === 'loading') return <LoadingState label={t('loading')} />;
  if (load === 'permission') return <PermissionDeniedState title={t('permission_title')} body={t('permission_body')} />;
  if (load === 'unavailable') {
    return (
      <ProviderUnavailableState
        title={t('unavailable_title')}
        body={t('unavailable_body')}
        action={
          <Button type="button" onClick={() => void loadData()}>
            {t('retry')}
          </Button>
        }
      />
    );
  }
  if (load === 'signed-out') {
    return (
      <EmptyState
        title={t('signed_out_title')}
        body={t('signed_out_body')}
        action={
          <a href={signInHref} className="btn-primary min-h-career-touch inline-flex items-center px-4 py-2 font-medium">
            {t('sign_in')}
          </a>
        }
      />
    );
  }

  const selectedPack = packs.find((p) => p.id === selectedPackId) || packs[0] || null;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-career-navy dark:text-white sm:text-3xl">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-4">
          {balance && (
            <div className="text-right text-xs">
              <span className="font-semibold text-career-ink">{t('remaining_credits')}:</span>{' '}
              <span className="font-bold text-career-navy dark:text-career-orange">
                {balance.includedRemaining + balance.packRemaining}
              </span>
            </div>
          )}
          {!isGenerating && (
            <Button type="button" onClick={() => setIsGenerating(true)}>
              {t('generate_new')}
            </Button>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      {/* Generation Form */}
      {isGenerating && (
        <Card className="p-6">
          <form onSubmit={handleGenerate} className="space-y-4">
            <h2 className="text-lg font-semibold text-career-navy dark:text-white">{t('generate_heading')}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">{t('generate_cost_notice')}</p>

            <div>
              <label htmlFor="opp-select" className="block text-sm font-semibold text-career-ink">
                {t('select_opportunity')} *
              </label>
              <select
                id="opp-select"
                value={selectedOppId}
                onChange={(e) => setSelectedOppId(e.target.value)}
                required
                className="mt-1.5 block w-full rounded-md border border-career-line bg-career-surface px-3 py-2 text-base text-career-ink shadow-sm focus:border-career-navy focus:outline-none focus:ring-1 focus:ring-career-navy"
              >
                <option value="">{t('choose_placeholder')}</option>
                {opportunities.map((opp) => (
                  <option key={opp.id} value={opp.id}>
                    {opp.title} — {opp.organization || t('unstated_org')}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4">
              <Button type="button" variant="secondary" onClick={() => setIsGenerating(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" loading={submitting} loadingLabel={t('generating')} disabled={!selectedOppId}>
                {t('run_action_engine')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {packs.length === 0 && !isGenerating ? (
        <EmptyState
          title={t('empty_title')}
          body={t('empty_body')}
          action={
            <Button type="button" onClick={() => setIsGenerating(true)}>
              {t('generate_new')}
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Left Column: List of saved Action Packs */}
          <div className="space-y-3 lg:col-span-1">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-career-muted">{t('saved_packs')}</h2>
            <div className="space-y-2">
              {packs.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => setSelectedPackId(pack.id)}
                  className={`w-full text-left rounded-lg border p-4 transition-all ${
                    selectedPack?.id === pack.id
                      ? 'border-career-navy bg-career-navy/5 shadow-sm dark:border-career-orange dark:bg-career-orange/10'
                      : 'border-career-line bg-career-surface hover:bg-career-wash'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-career-ink line-clamp-1">{pack.vacancySnapshot.title}</h3>
                    <Badge tone={FIT_TONES[pack.fit.fit] || 'neutral'}>
                      {t(`fit_${pack.fit.fit}`)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-career-muted line-clamp-1">
                    {pack.vacancySnapshot.organization || t('unstated_org')}
                  </p>
                  <p className="mt-2 text-xs text-career-muted">
                    {new Date(pack.createdAt).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Right Column: Detailed View of Selected Pack */}
          {selectedPack && (
            <div className="space-y-6 lg:col-span-2">
              {/* Vacancy Snapshot Card */}
              <Card className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-career-line pb-4">
                  <div>
                    <h2 className="text-xl font-bold text-career-ink">{selectedPack.vacancySnapshot.title}</h2>
                    <p className="text-sm font-medium text-career-navy dark:text-career-orange">
                      {selectedPack.vacancySnapshot.organization || t('unstated_org')}
                    </p>
                  </div>
                  <Badge tone={FIT_TONES[selectedPack.fit.fit] || 'neutral'}>
                    {t(`fit_${selectedPack.fit.fit}`)}
                  </Badge>
                </div>

                <div className="mt-4 space-y-4">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-career-muted">{t('vacancy_description')}</h3>
                    <p className="mt-1 text-sm text-career-ink/80 line-clamp-4">{selectedPack.vacancySnapshot.description}</p>
                  </div>

                  {/* Fit & Gaps Breakdown */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2">
                    <div className="rounded-md border border-career-line bg-career-surface/50 p-3">
                      <h4 className="text-xs font-semibold text-green-700 dark:text-green-400">
                        ✓ {t('fit_reasons')}
                      </h4>
                      <ul className="mt-1 list-disc pl-4 text-xs text-career-ink/80 space-y-1">
                        {selectedPack.fit.reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-md border border-career-line bg-career-surface/50 p-3">
                      <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                        ⚠ {t('skill_gaps')}
                      </h4>
                      <ul className="mt-1 list-disc pl-4 text-xs text-career-ink/80 space-y-1">
                        {selectedPack.fit.gaps.length > 0 ? (
                          selectedPack.fit.gaps.map((g, i) => (
                            <li key={i}>{g}</li>
                          ))
                        ) : (
                          <li>{t('no_major_gaps')}</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Action Checklist Card */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-career-ink">{t('preparation_checklist')}</h3>
                <p className="mt-0.5 text-xs text-career-muted">{t('checklist_hint')}</p>

                <div className="mt-4 space-y-3">
                  {selectedPack.checklist.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-start gap-3 rounded-md border border-career-line p-3 transition-colors hover:bg-career-wash cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={() => handleChecklistToggle(selectedPack.id, item.id, item.done)}
                        className="mt-0.5 h-4 w-4 rounded border-career-line text-career-navy focus:ring-career-navy"
                      />
                      <span className={`text-sm ${item.done ? 'line-through text-career-muted' : 'text-career-ink'}`}>
                        {item.label}
                      </span>
                    </label>
                  ))}
                </div>
              </Card>

              {/* Tailored Cover Letter Card */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-career-ink">{t('tailored_letter')}</h3>
                <div className="mt-3 rounded-md border border-career-line bg-career-wash/30 p-4 font-sans text-sm text-career-ink whitespace-pre-wrap leading-relaxed">
                  {selectedPack.coverLetter.body}
                </div>
              </Card>

              {/* Tailored Resume Summary Card */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-career-ink">{t('tailored_resume')}</h3>
                <p className="mt-0.5 text-xs text-career-muted">{t('resume_facts_used')}: {selectedPack.tailoredResume.factIds.length}</p>

                <div className="mt-4 divide-y divide-career-line">
                  {selectedPack.tailoredResume.lines.map((line, idx) => (
                    <div key={idx} className="py-2 text-sm text-career-ink flex items-start gap-2">
                      <span className="text-xs font-semibold text-career-muted uppercase tracking-wider w-20 shrink-0">
                        {line.factType}
                      </span>
                      <span>{line.text}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Next Steps Card */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-career-ink">{t('next_steps')}</h3>
                <ul className="mt-3 list-decimal pl-5 text-sm text-career-ink/90 space-y-2">
                  {selectedPack.nextSteps.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ul>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
