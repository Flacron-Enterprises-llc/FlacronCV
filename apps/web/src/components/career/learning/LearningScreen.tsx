'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  isApiError,
  newIdempotencyKey,
  type ApiClient,
  type LearningPlanMilestone,
  type SkillGapReport,
  type SkillReportBalanceView,
} from '@flacroncv/career-api-client';
import { isEssentialCredential, learningPlanCost } from '@flacroncv/career-shared';
import { ProjectBriefPanel, evidenceErrorText } from './ProjectBriefPanel';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  InlineNote,
  LoadingState,
  PageHeader,
  PermissionDeniedState,
  ProviderUnavailableState,
  ScreenStack,
} from '@/components/career/ui';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { profileLoadFailure } from '@/lib/career/profile-load';

const GAP_TONES: Record<string, 'neutral' | 'recommended' | 'later' | 'draft' | 'confirmed' | 'submitted'> = {
  critical: 'draft',
  preferred: 'recommended',
  optional: 'neutral',
};

export function LearningScreen({
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
  const t = useTranslations('career.learning');
  const locale = useLocale();
  const [load, setLoad] = useState<'loading' | 'permission' | 'unavailable' | 'signed-out' | 'ready'>('loading');
  const [reports, setReports] = useState<SkillGapReport[]>([]);
  const [balance, setBalance] = useState<SkillReportBalanceView | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [targetRole, setTargetRole] = useState('');
  const [targetIndustry, setTargetIndustry] = useState('');
  const [timeBudget, setTimeBudget] = useState(5);
  const [financialBudget, setFinancialBudget] = useState(0);
  const [includeBrief, setIncludeBrief] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [convertingMilestoneId, setConvertingMilestoneId] = useState<string | null>(null);
  const [evidenceSuccess, setEvidenceSuccess] = useState<{ created: boolean } | null>(null);
  /** Milestone whose "in your own words" box is open, and its draft. */
  const [ownershipFor, setOwnershipFor] = useState<string | null>(null);
  const [milestoneOwnership, setMilestoneOwnership] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoad('loading');
    setErrorMessage(null);
    try {
      const res = await api.skillReports();
      setReports(res.items);
      setBalance(res.skillReport);
      setSelectedReportId((curr) => curr || (res.items.length > 0 ? res.items[0].id : null));
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
    if (!targetRole.trim()) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const key = newIdempotencyKey();
      const res = await api.createSkillReport(
        {
          targetRole: targetRole.trim(),
          targetIndustry: targetIndustry.trim() || null,
          timeBudgetHoursPerWeek: timeBudget,
          financialBudgetCents: financialBudget * 100,
          includeProjectBrief: includeBrief,
        },
        key,
      );
      setReports((prev) => [res.report, ...prev]);
      setSelectedReportId(res.report.id);
      setIsGenerating(false);
      setTargetRole('');
      setTargetIndustry('');
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
      } else if (isApiError(error, 'provider_unavailable')) {
        // A plan is written for the role by the model; without it nothing is charged.
        setErrorMessage(t('provider_unavailable'));
      } else {
        setErrorMessage(t('generate_failed'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleMilestone = async (reportId: string, milestoneId: string, currentCompleted: boolean) => {
    try {
      const updated = await api.updateLearningProgress(reportId, milestoneId, !currentCompleted);
      setReports((prev) => prev.map((r) => (r.id === reportId ? updated : r)));
    } catch {
      setErrorMessage(t('progress_update_failed'));
    }
  };

  const handleConvertToEvidence = async (reportId: string, milestoneId: string) => {
    setConvertingMilestoneId(milestoneId);
    setEvidenceSuccess(null);
    setErrorMessage(null);
    try {
      const statement = milestoneOwnership.trim();
      const res = await api.convertMilestoneToEvidence(reportId, milestoneId, statement || undefined);
      setEvidenceSuccess({ created: res.created });
      setReports((prev) =>
        prev.map((r) =>
          r.id === reportId
            ? {
                ...r,
                progress: {
                  ...r.progress,
                  evidenceByMilestone: { ...(r.progress.evidenceByMilestone ?? {}), [milestoneId]: res.evidenceId },
                },
              }
            : r,
        ),
      );
      setOwnershipFor(null);
      setMilestoneOwnership('');
    } catch (error) {
      setErrorMessage(evidenceErrorText(error, t));
    } finally {
      setConvertingMilestoneId(null);
    }
  };

  const replaceReport = (next: SkillGapReport) => setReports((prev) => prev.map((r) => (r.id === next.id ? next : r)));

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

  const selectedReport = reports.find((r) => r.id === selectedReportId) || reports[0] || null;
  const remainingCredits = balance ? balance.includedRemaining + balance.packRemaining : null;
  const money = (cents: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
  const planCost = selectedReport ? learningPlanCost(selectedReport.learningPlan, selectedReport.financialBudgetCents) : null;
  const milestoneCost = (milestone: LearningPlanMilestone) =>
    // The server only sends a cost together with the date it was stated.
    milestone.estimatedCostCents === null || !milestone.costAsOf
      ? t('cost_unknown')
      : t('cost_as_of', {
          amount: milestone.estimatedCostCents === 0 ? t('free') : money(milestone.estimatedCostCents),
          date: milestone.costAsOf,
        });

  return (
    <ScreenStack>
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <>
            {balance ? (
              <span className="text-xs text-career-muted">
                {t('remaining_credits')}: <span className="font-bold text-career-ink">{balance.includedRemaining + balance.packRemaining}</span>
              </span>
            ) : null}
            {!isGenerating ? (
              <Button type="button" onClick={() => setIsGenerating(true)}>
                {t('generate_new')}
              </Button>
            ) : null}
          </>
        }
      />

      {errorMessage ? <InlineNote tone="error">{errorMessage}</InlineNote> : null}

      {evidenceSuccess && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300 flex items-center justify-between">
          <span>{evidenceSuccess.created ? t('evidence_created_success') : t('evidence_already_recorded')}</span>
          <a href={`/${locale}/career/evidence`} className="underline font-semibold text-xs ml-2">
            {t('view_in_vault')}
          </a>
        </div>
      )}

      {/* Generation Drawer / Form */}
      {isGenerating && (
        <Card className="border-career-orange/30 bg-career-orange/5 p-6 dark:bg-career-orange/10">
          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="border-b border-career-line pb-3">
              <h2 className="text-lg font-bold text-career-ink">{t('generate_heading')}</h2>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="targetRole" className="block text-xs font-semibold text-career-ink uppercase tracking-wider">
                  {t('field_target_role')} *
                </label>
                <input
                  id="targetRole"
                  type="text"
                  required
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  placeholder={t('field_target_role_placeholder')}
                  className="mt-1 w-full rounded-md border border-career-line bg-career-surface px-3 py-2 text-sm text-career-ink focus:border-career-navy focus:outline-none dark:focus:border-career-orange"
                />
              </div>

              <div>
                <label htmlFor="targetIndustry" className="block text-xs font-semibold text-career-ink uppercase tracking-wider">
                  {t('field_target_industry')}
                </label>
                <input
                  id="targetIndustry"
                  type="text"
                  value={targetIndustry}
                  onChange={(e) => setTargetIndustry(e.target.value)}
                  placeholder={t('field_target_industry_placeholder')}
                  className="mt-1 w-full rounded-md border border-career-line bg-career-surface px-3 py-2 text-sm text-career-ink focus:border-career-navy focus:outline-none dark:focus:border-career-orange"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="timeBudget" className="block text-xs font-semibold text-career-ink uppercase tracking-wider">
                  {t('field_time_budget')} ({timeBudget} {t('hours_per_week')})
                </label>
                <input
                  id="timeBudget"
                  type="range"
                  min="2"
                  max="30"
                  step="1"
                  value={timeBudget}
                  onChange={(e) => setTimeBudget(Number(e.target.value))}
                  className="mt-2 w-full accent-career-navy dark:accent-career-orange cursor-pointer"
                />
              </div>

              <div>
                <label htmlFor="financialBudget" className="block text-xs font-semibold text-career-ink uppercase tracking-wider">
                  {t('field_financial_budget')} ($)
                </label>
                <input
                  id="financialBudget"
                  type="number"
                  min="0"
                  step="10"
                  value={financialBudget}
                  onChange={(e) => setFinancialBudget(Number(e.target.value))}
                  className="mt-1 w-full rounded-md border border-career-line bg-career-surface px-3 py-2 text-sm text-career-ink focus:border-career-navy focus:outline-none dark:focus:border-career-orange"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                id="includeBrief"
                type="checkbox"
                checked={includeBrief}
                onChange={(e) => setIncludeBrief(e.target.checked)}
                className="h-4 w-4 rounded border-career-line text-career-navy focus:ring-career-navy"
              />
              <label htmlFor="includeBrief" className="text-xs text-career-ink font-medium cursor-pointer">
                {t('include_project_brief_label')}
              </label>
            </div>

            {/* Spec §21: before a paid generation, show the operation, the credits it needs, the balance and what it contains. */}
            <div className="rounded-md border border-career-line bg-career-surface p-3 text-xs text-career-ink" data-testid="learning-charge-notice">
              <dl className="grid grid-cols-1 gap-1 sm:grid-cols-3">
                <div>
                  <dt className="text-career-muted">{t('charge_operation')}</dt>
                  <dd className="font-semibold">{t('charge_operation_value')}</dd>
                </div>
                <div>
                  <dt className="text-career-muted">{t('charge_required')}</dt>
                  <dd className="font-semibold">{t('charge_required_value', { count: 1 })}</dd>
                </div>
                <div>
                  <dt className="text-career-muted">{t('charge_remaining')}</dt>
                  <dd className="font-semibold">
                    {remainingCredits === null ? t('charge_remaining_unknown') : t('charge_remaining_value', { count: remainingCredits })}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-career-muted">{t('charge_contents')}</p>
              {remainingCredits === 0 ? <p className="mt-2 font-semibold">{t('quota_exhausted')}</p> : null}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <Button type="button" variant="secondary" onClick={() => setIsGenerating(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={submitting || !targetRole.trim() || remainingCredits === 0}>
                {submitting ? t('generating') : t('run_learning_engine')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Main Content Area */}
      {reports.length === 0 ? (
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
          {/* Left Column: List of saved Skill Reports */}
          <div className="space-y-3 lg:col-span-1">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-career-muted">{t('saved_reports')}</h2>
            <div className="space-y-2">
              {reports.map((report) => (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => setSelectedReportId(report.id)}
                  className={`w-full text-left rounded-lg border p-4 transition-all ${
                    selectedReport?.id === report.id
                      ? 'border-career-navy bg-career-navy/5 shadow-sm dark:border-career-orange dark:bg-career-orange/10'
                      : 'border-career-line bg-career-surface hover:bg-career-wash'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-career-ink line-clamp-1">{report.targetRole}</h3>
                    <Badge tone={report.progress.percent === 100 ? 'confirmed' : 'recommended'}>
                      {report.progress.percent}%
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-career-muted">
                    {report.targetIndustry || t('general_industry')} • {t('hours_week_short', { count: report.timeBudgetHoursPerWeek })}
                  </p>
                  <p className="mt-2 text-xs text-career-muted">
                    {new Date(report.createdAt).toLocaleDateString(locale)}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Right Column: Detailed View of Selected Report */}
          {selectedReport && (
            <div className="space-y-6 lg:col-span-2">
              {/* Report Header & Progress Overview */}
              <Card className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-career-line pb-4">
                  <div>
                    <h2 className="text-xl font-bold text-career-ink">{selectedReport.targetRole}</h2>
                    <p className="text-sm font-medium text-career-navy">
                      {selectedReport.targetIndustry ? `${selectedReport.targetIndustry} • ` : ''}
                      {selectedReport.timeBudgetHoursPerWeek} {t('hours_per_week')} •{' '}
                      {t('budget_value', { amount: money(selectedReport.financialBudgetCents) })}
                    </p>
                    {planCost ? (
                      <p className="mt-1 text-xs text-career-muted" data-testid="learning-plan-cost">
                        {t('plan_cost_known', { amount: money(planCost.knownTotalCents) })}
                        {planCost.unknownCount > 0 ? ` • ${t('plan_cost_unknown_count', { count: planCost.unknownCount })}` : ''}
                        {' • '}
                        {planCost.withinBudget === true
                          ? t('plan_within_budget')
                          : planCost.withinBudget === false
                            ? t('plan_over_budget')
                            : t('plan_budget_unclear')}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-career-muted font-semibold">{t('plan_progress')}</span>
                    <div className="text-lg font-bold text-career-navy">
                      {selectedReport.progress.percent}%
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-4">
                  <div className="w-full bg-career-line rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-career-navy dark:bg-career-orange h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${selectedReport.progress.percent}%` }}
                    />
                  </div>
                </div>

                {/* Skill Gap Matrix */}
                <div className="mt-6 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-career-muted">{t('identified_gaps')}</h3>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {selectedReport.skillGaps.map((gap) => (
                      <div
                        key={gap.skill}
                        className="rounded-md border border-career-line bg-career-surface/60 p-3 flex items-center justify-between gap-2"
                      >
                        <div>
                          <p className="text-sm font-semibold text-career-ink">{gap.skill}</p>
                          <p className="text-xs text-career-muted">
                            {t('level_current')}: <span className="font-medium text-career-ink">{gap.currentLevel}</span> →{' '}
                            {t('level_target')}: <span className="font-medium text-career-ink">{gap.requiredLevel}</span>
                          </p>
                        </div>
                        {gap.kind === 'credential' ? (
                          <Badge tone={isEssentialCredential(gap) ? 'submitted' : 'neutral'}>
                            {isEssentialCredential(gap) ? t('essential_credential') : t('credential_kind', { importance: t(`importance_${gap.importance}`) })}
                          </Badge>
                        ) : (
                          <Badge tone={GAP_TONES[gap.importance] || 'neutral'}>
                            {t(`importance_${gap.importance}`)}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                  {selectedReport.skillGaps.some((gap) => isEssentialCredential(gap)) ? (
                    <p className="text-xs text-career-muted">{t('essential_credential_hint')}</p>
                  ) : null}
                </div>

                {(selectedReport.transferableSkills?.length ?? 0) > 0 || (selectedReport.bridgeRoles?.length ?? 0) > 0 ? (
                  <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {(selectedReport.transferableSkills?.length ?? 0) > 0 ? (
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-career-muted">{t('transferable_skills')}</h3>
                        <p className="mt-0.5 text-xs text-career-muted">{t('transferable_skills_hint')}</p>
                        <ul className="mt-2 flex flex-wrap gap-1">
                          {selectedReport.transferableSkills!.map((item) => (
                            <li key={item.skill}>
                              <Badge tone="confirmed">
                                <span dir="auto">{item.skill}</span>
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {(selectedReport.bridgeRoles?.length ?? 0) > 0 ? (
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-career-muted">{t('bridge_roles')}</h3>
                        <ul className="mt-2 space-y-1 text-xs">
                          {selectedReport.bridgeRoles!.map((role) => (
                            <li key={role.title} dir="auto">
                              <span className="font-semibold text-career-ink">{role.title}</span>
                              <span className="text-career-muted"> — {role.reason}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </Card>

              {/* Learning Plan Milestones */}
              <Card className="p-6">
                <div className="border-b border-career-line pb-3">
                  <h3 className="text-lg font-semibold text-career-ink">{t('milestone_plan')}</h3>
                  <p className="mt-0.5 text-xs text-career-muted">{t('milestone_plan_hint')}</p>
                  <p className="mt-0.5 text-xs text-career-muted">{t('completion_not_credential')}</p>
                </div>

                <div className="mt-4 space-y-4">
                  {selectedReport.learningPlan.map((milestone, idx) => {
                    const isDone = selectedReport.progress.completedMilestoneIds.includes(milestone.id);
                    return (
                      <div
                        key={milestone.id}
                        className={`rounded-lg border p-4 transition-colors ${
                          isDone ? 'border-career-line bg-career-wash/40' : 'border-career-line bg-career-surface'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <label className="flex items-start gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isDone}
                              onChange={() =>
                                void handleToggleMilestone(selectedReport.id, milestone.id, isDone)
                              }
                              className="mt-1 h-4 w-4 rounded border-career-line text-career-navy focus:ring-career-navy"
                            />
                            <div>
                              <p className={`text-sm font-semibold ${isDone ? 'line-through text-career-muted' : 'text-career-ink'}`}>
                                {idx + 1}. {milestone.title}
                              </p>
                              <p className="mt-0.5 text-xs text-career-ink/80">{milestone.description}</p>
                              <p className="mt-1 text-xs text-career-muted">
                                {t('target_skill')}: <span className="font-medium text-career-ink">{milestone.targetSkill}</span> •{' '}
                                {t('hours_about', { count: milestone.estimatedHours })} • {milestoneCost(milestone)}
                              </p>
                              {milestone.prerequisites && milestone.prerequisites.length > 0 ? (
                                <p className="mt-1 text-xs text-career-muted" dir="auto">
                                  {t('prerequisites')}: {milestone.prerequisites.join(', ')}
                                </p>
                              ) : null}
                            </div>
                          </label>

                          {/* Completed milestones can be recorded in the vault, once. */}
                          {isDone && (
                            selectedReport.progress.evidenceByMilestone?.[milestone.id] ? (
                              <Badge tone="confirmed">{t('in_evidence_vault')}</Badge>
                            ) : ownershipFor === milestone.id ? null : (
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => {
                                  setOwnershipFor(milestone.id);
                                  setMilestoneOwnership('');
                                }}
                              >
                                {t('add_to_evidence_vault')}
                              </Button>
                            )
                          )}
                        </div>

                        {isDone && ownershipFor === milestone.id ? (
                          <div className="mt-3 space-y-2 ps-7">
                            <label htmlFor={`milestone-own-${milestone.id}`} className="block text-xs font-semibold text-career-ink">
                              {t('milestone_ownership_label')}
                            </label>
                            <textarea
                              id={`milestone-own-${milestone.id}`}
                              rows={2}
                              maxLength={2000}
                              dir="auto"
                              value={milestoneOwnership}
                              onChange={(e) => setMilestoneOwnership(e.target.value)}
                              className="w-full rounded-md border border-career-line bg-career-surface px-3 py-2 text-xs text-career-ink"
                            />
                            <p className="text-xs text-career-muted">{t('milestone_ownership_hint')}</p>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                onClick={() => void handleConvertToEvidence(selectedReport.id, milestone.id)}
                                disabled={convertingMilestoneId === milestone.id}
                              >
                                {convertingMilestoneId === milestone.id ? t('saving_evidence') : t('confirm_add_to_vault')}
                              </Button>
                              <Button type="button" variant="ghost" onClick={() => setOwnershipFor(null)}>
                                {t('cancel')}
                              </Button>
                            </div>
                          </div>
                        ) : null}

                        {/* Resources List */}
                        {milestone.resources.length > 0 && (
                          <div className="mt-3 pl-7 space-y-1">
                            <p className="text-xs font-semibold text-career-muted uppercase tracking-wider">
                              {t('recommended_resources')}
                            </p>
                            <div className="space-y-1">
                              {milestone.resources.map((res) => (
                                <div key={`${res.title}-${res.provider}`} className="text-xs flex items-center justify-between gap-2">
                                  {/* New plans carry no links (a model could invent one); older plans keep theirs. */}
                                  {res.url ? (
                                    <a
                                      href={res.url}
                                      target="_blank"
                                      rel="noreferrer noopener"
                                      className="font-medium text-career-navy hover:underline"
                                    >
                                      {res.title} <span className="text-career-muted">({res.provider})</span> ↗
                                    </a>
                                  ) : (
                                    <span className="font-medium text-career-ink" dir="auto">
                                      {res.title} <span className="text-career-muted">({res.provider})</span>
                                    </span>
                                  )}
                                  <span className="text-career-muted">{res.isFree ? t('free') : t('paid')}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>

              {selectedReport.projectBrief && (
                <ProjectBriefPanel key={selectedReport.id} api={api} report={selectedReport} onReport={replaceReport} />
              )}
            </div>
          )}
        </div>
      )}
    </ScreenStack>
  );
}
