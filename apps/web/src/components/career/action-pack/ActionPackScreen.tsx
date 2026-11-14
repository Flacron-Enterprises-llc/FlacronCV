'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ACTION_PACK_CHECKLIST_IDS, ACTION_PACK_LETTER_ATTEMPTS, actionPackNextStepCodes, statedOrganization } from '@flacroncv/career-shared';
import {
  isApiError,
  newIdempotencyKey,
  type ActionPack,
  type ActionPackBalanceView,
  type ActionPackChecklistItem,
  type ActionPackComponent,
  type ActionPackEdit,
  type ApiClient,
  type OpportunityItem,
} from '@flacroncv/career-api-client';
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
import { opportunityIdFromUrl } from '@/lib/career/opportunity-param';
import { downloadName } from '@/components/career/resume/ResumeScreen';
import { ChecklistEditor, FitEditor, LetterEditor, NextStepsEditor, ResumeEditor } from './ActionPackEditors';

const FIT_TONES: Record<string, 'neutral' | 'recommended' | 'later' | 'draft' | 'confirmed' | 'submitted'> = {
  strong: 'confirmed',
  partial: 'recommended',
  possible: 'recommended',
  none: 'neutral',
  blocked: 'draft',
};

const CHECKLIST_IDS: readonly string[] = ACTION_PACK_CHECKLIST_IDS;

/** Packs saved before the server fix can hold the "unstated" storage marker; it is never shown. */
function normalizePack(pack: ActionPack): ActionPack {
  return { ...pack, vacancySnapshot: { ...pack.vacancySnapshot, organization: statedOrganization(pack.vacancySnapshot.organization) } };
}

/** Packs made before resumable packs existed have no status; they are complete. */
function statusOf(pack: ActionPack) {
  return pack.status ?? 'complete';
}

/**
 * Words behind "why you qualify" and the gaps. Packs saved before the tokens
 * existed (or whose fit the person rewrote) hold sentences only; those are shown as they are.
 */
function tokensOf(pack: ActionPack, key: 'reasonTokens' | 'gapTokens', legacy: string[]): { tokens: string[]; legacy: string[] } {
  const tokens = pack.fit[key];
  return Array.isArray(tokens) ? { tokens, legacy: [] } : { tokens: [], legacy };
}

type Note = { tone: 'success' | 'error' | 'info'; text: string; documentsLink?: boolean } | null;

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
  const locale = useLocale();
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const [load, setLoad] = useState<'loading' | 'permission' | 'unavailable' | 'signed-out' | 'ready'>('loading');
  const [packs, setPacks] = useState<ActionPack[]>([]);
  const [balance, setBalance] = useState<ActionPackBalanceView | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityItem[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  // Preselected when opened from an alert or listing (?opportunityId=).
  const [selectedOppId, setSelectedOppId] = useState<string>(opportunityIdFromUrl);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<ActionPackComponent | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [busy, setBusy] = useState<'retry' | 'cancel' | 'documents' | 'download' | null>(null);
  const [packNote, setPackNote] = useState<Note>(null);

  const loadData = useCallback(async () => {
    setLoad('loading');
    setErrorMessage(null);
    try {
      const [packRes, oppRes] = await Promise.all([
        api.actionPacks(),
        api.opportunities({ q: '' }),
      ]);
      setPacks(packRes.items.map(normalizePack));
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

  function replacePack(pack: ActionPack) {
    setPacks((prev) => prev.map((p) => (p.id === pack.id ? normalizePack(pack) : p)));
  }

  function removePack(packId: string) {
    setPacks((prev) => prev.filter((p) => p.id !== packId));
    setSelectedPackId(null);
  }

  function noteUsage(usage: { includedRemaining: number; packRemaining: number }) {
    setBalance((prev) => (prev ? { ...prev, includedRemaining: usage.includedRemaining, packRemaining: usage.packRemaining } : prev));
  }

  function selectPack(packId: string) {
    setSelectedPackId(packId);
    setEditing(null);
    setPackNote(null);
  }

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOppId) return;
    setSubmitting(true);
    setErrorMessage(null);
    setPackNote(null);
    try {
      const key = newIdempotencyKey();
      const res = await api.createActionPack({ opportunityId: selectedOppId }, key);
      setPacks((prev) => [normalizePack(res.actionPack), ...prev.filter((p) => p.id !== res.actionPack.id)]);
      setSelectedPackId(res.actionPack.id);
      setEditing(null);
      setIsGenerating(false);
      setSelectedOppId('');
      noteUsage(res.usage);
    } catch (error) {
      if (isApiError(error, 'plan_upgrade_required')) {
        setErrorMessage(t('plan_upgrade_required'));
      } else if (isApiError(error, 'quota_exhausted')) {
        setErrorMessage(t('quota_exhausted'));
      } else if (isApiError(error, 'feature_unavailable')) {
        setErrorMessage(t('feature_unavailable'));
      } else if (isApiError(error, 'validation_error')) {
        const reason = error.body.reason;
        setErrorMessage(
          reason === 'listing_too_short'
            ? t('listing_too_short')
            : reason === 'need_experience_or_education'
              ? t('need_role')
              : t('validation_error'),
        );
      } else if (isApiError(error, 'provider_unavailable')) {
        // The letter needs the writing model; nothing was saved and no credit was used.
        setErrorMessage(t('provider_unavailable'));
        setIsGenerating(false);
      } else {
        setErrorMessage(t('generate_failed'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleChecklistToggle = async (packId: string, checklistId: string, currentDone: boolean) => {
    try {
      replacePack(await api.updateActionPackChecklist(packId, checklistId, !currentDone));
    } catch {
      setErrorMessage(t('checklist_update_failed'));
    }
  };

  async function saveEdit(pack: ActionPack, edit: ActionPackEdit) {
    setSavingEdit(true);
    setPackNote(null);
    try {
      replacePack(await api.updateActionPack(pack.id, edit));
      setEditing(null);
      setPackNote({ tone: 'success', text: t('edit_saved') });
    } catch {
      setPackNote({ tone: 'error', text: t('edit_failed') });
    } finally {
      setSavingEdit(false);
    }
  }

  async function retryLetter(pack: ActionPack) {
    setBusy('retry');
    setPackNote(null);
    try {
      const res = await api.retryActionPackComponent(pack.id, 'coverLetter');
      replacePack(res.actionPack);
      noteUsage(res.usage);
      setPackNote(
        statusOf(res.actionPack) === 'complete'
          ? { tone: 'success', text: t('retry_succeeded') }
          : { tone: 'error', text: t('retry_failed') },
      );
    } catch (error) {
      if (isApiError(error, 'provider_unavailable') && error.body.released === true) {
        // Final failure: the server removed the pack and returned the held credit.
        removePack(pack.id);
        setErrorMessage(error.body.reason === 'pack_expired' ? t('status_expired') : t('final_failure'));
        void loadData();
      } else {
        setPackNote({ tone: 'error', text: t('retry_failed') });
      }
    } finally {
      setBusy(null);
    }
  }

  async function cancelPack(pack: ActionPack) {
    setBusy('cancel');
    setPackNote(null);
    try {
      await api.cancelActionPack(pack.id);
      removePack(pack.id);
      setErrorMessage(null);
      setPackNote({ tone: 'success', text: t('cancel_pack_done') });
      void loadData();
    } catch {
      setPackNote({ tone: 'error', text: t('cancel_pack_failed') });
    } finally {
      setBusy(null);
    }
  }

  async function saveDocuments(pack: ActionPack) {
    setBusy('documents');
    setPackNote(null);
    try {
      const res = await api.saveActionPackDocuments(pack.id);
      replacePack(res.actionPack);
      setPackNote({ tone: 'success', text: t('saved_documents'), documentsLink: true });
    } catch (error) {
      if (isApiError(error, 'capacity_exceeded')) setPackNote({ tone: 'error', text: t('save_capacity_exceeded') });
      else if (isApiError(error, 'plan_upgrade_required')) setPackNote({ tone: 'error', text: t('save_plan_upgrade') });
      else setPackNote({ tone: 'error', text: t('save_failed') });
    } finally {
      setBusy(null);
    }
  }

  async function download(pack: ActionPack, component: 'tailoredResume' | 'coverLetter', format: 'pdf' | 'docx') {
    setBusy('download');
    setPackNote(null);
    try {
      const file = await api.exportActionPack(pack.id, component, format);
      const buffer = new ArrayBuffer(file.bytes.byteLength);
      new Uint8Array(buffer).set(file.bytes);
      const blob = new Blob([buffer], { type: file.contentType });
      if (typeof URL.createObjectURL === 'function') {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = component === 'tailoredResume'
          ? downloadName(pack.tailoredResume.title, 'resume', format)
          : downloadName(pack.coverLetter?.title ?? '', 'letter', format);
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      setPackNote({ tone: 'error', text: isApiError(error, 'plan_upgrade_required') ? t('docx_upgrade') : t('download_failed') });
    } finally {
      setBusy(null);
    }
  }

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

  const remaining = balance ? balance.includedRemaining + balance.packRemaining : null;
  const selectedPack = packs.find((p) => p.id === selectedPackId) || packs[0] || null;
  const reasons = selectedPack ? tokensOf(selectedPack, 'reasonTokens', selectedPack.fit.reasons) : { tokens: [], legacy: [] };
  const gaps = selectedPack ? tokensOf(selectedPack, 'gapTokens', selectedPack.fit.gaps) : { tokens: [], legacy: [] };
  const status = selectedPack ? statusOf(selectedPack) : 'complete';
  const editable = status === 'complete' || status === 'partial';
  const edited = new Set(selectedPack?.editedComponents ?? []);
  const gapCount = gaps.tokens.length || selectedPack?.fit.gaps.length || 0;
  const nextStepTexts = selectedPack
    ? edited.has('nextSteps')
      ? selectedPack.nextSteps
      : actionPackNextStepCodes(selectedPack.fit.fit, gapCount).map((code) => t(`next_${code}`, { count: gapCount }))
    : [];
  const checklistLabel = (item: ActionPackChecklistItem) =>
    selectedPack && CHECKLIST_IDS.includes(item.id)
      ? selectedPack.vacancySnapshot.organization
        ? t(`checklist_${item.id}_at`, { title: selectedPack.vacancySnapshot.title, organization: selectedPack.vacancySnapshot.organization })
        : t(`checklist_${item.id}`, { title: selectedPack.vacancySnapshot.title })
      : item.label;
  const attemptsLeft = selectedPack ? Math.max(0, ACTION_PACK_LETTER_ATTEMPTS - (selectedPack.letterAttempts ?? 1)) : 0;

  const editButton = (component: ActionPackComponent) =>
    editable && editing !== component && !(component === 'coverLetter' && !selectedPack?.coverLetter) ? (
      <Button type="button" variant="ghost" onClick={() => { setEditing(component); setPackNote(null); }}>
        {t('edit')}
      </Button>
    ) : null;
  const editedBadge = (component: ActionPackComponent) => (edited.has(component) ? <Badge tone="neutral">{t('edited_badge')}</Badge> : null);

  return (
    <ScreenStack>
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <>
            {balance ? (
              <span className="text-xs text-career-muted">
                {t('remaining_credits')}: <span className="font-bold text-career-ink">{remaining}</span>
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

      {/* Generation Form */}
      {isGenerating && (
        <Card className="p-6">
          <form onSubmit={handleGenerate} className="space-y-4">
            <h2 className="text-lg font-semibold text-career-ink">{t('generate_heading')}</h2>
            <p className="text-sm text-career-muted">{t('generate_cost_notice')}</p>

            {/* Spec §21: operation, credits required and the balance, before the paid run. */}
            <dl className="grid grid-cols-1 gap-2 rounded-md border border-career-line bg-career-wash/40 p-3 text-sm sm:grid-cols-3" aria-label={t('cost_heading')}>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-career-muted">{t('cost_operation_label')}</dt>
                <dd className="text-career-ink">{t('cost_operation')}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-career-muted">{t('cost_required_label')}</dt>
                <dd className="text-career-ink">{t('cost_required', { count: 1 })}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-career-muted">{t('cost_balance_label')}</dt>
                <dd className="text-career-ink">
                  {remaining === null ? t('cost_balance_unknown') : t('cost_balance', { count: remaining })}
                </dd>
              </div>
            </dl>
            {remaining === 0 ? <InlineNote tone="error">{t('cost_none_left')}</InlineNote> : null}
            <p className="text-xs text-career-muted">{t('cost_retry_free')}</p>

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
                    {opp.organization ? `${opp.title} · ${opp.organization}` : opp.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4">
              <Button type="button" variant="secondary" onClick={() => setIsGenerating(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" loading={submitting} loadingLabel={t('generating')} disabled={!selectedOppId || remaining === 0}>
                {t('run_action_engine')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {packs.length === 0 && !isGenerating ? (
        <>
          {packNote ? <InlineNote tone={packNote.tone}>{packNote.text}</InlineNote> : null}
          <EmptyState
            title={t('empty_title')}
            body={t('empty_body')}
            action={
              <Button type="button" onClick={() => setIsGenerating(true)}>
                {t('generate_new')}
              </Button>
            }
          />
        </>
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
                  onClick={() => selectPack(pack.id)}
                  className={`w-full text-left rounded-lg border p-4 transition-all ${
                    selectedPack?.id === pack.id
                      ? 'border-career-navy bg-career-navy/5 shadow-sm dark:border-career-orange dark:bg-career-orange/10'
                      : 'border-career-line bg-career-surface hover:bg-career-wash'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-career-ink line-clamp-1">{pack.vacancySnapshot.title}</h3>
                    {statusOf(pack) === 'complete' ? (
                      <Badge tone={FIT_TONES[pack.fit.fit] || 'neutral'}>{t(`fit_${pack.fit.fit}`)}</Badge>
                    ) : (
                      <Badge tone="draft">{t(`status_badge_${statusOf(pack)}`)}</Badge>
                    )}
                  </div>
                  {pack.vacancySnapshot.organization ? (
                    <p className="mt-1 text-xs text-career-muted line-clamp-1">{pack.vacancySnapshot.organization}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-career-muted">
                    {dateFormat.format(new Date(pack.createdAt))}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Right Column: Detailed View of Selected Pack */}
          {selectedPack && (
            <div className="space-y-6 lg:col-span-2">
              {packNote ? (
                <InlineNote tone={packNote.tone}>
                  {packNote.text}{' '}
                  {packNote.documentsLink ? (
                    <a className="font-semibold underline" href={`/${locale}/career/documents`}>
                      {t('open_documents')}
                    </a>
                  ) : null}
                </InlineNote>
              ) : null}

              {status === 'partial' || (status === 'generating' && selectedPack.coverLetter === null) ? (
                <InlineNote tone="info" title={t('status_partial_title')}>
                  <p>{status === 'partial' ? t('status_partial') : t('status_generating')}</p>
                  {status === 'partial' ? <p className="mt-1 text-xs">{t('attempts_left', { count: attemptsLeft })}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {status === 'partial' && attemptsLeft > 0 ? (
                      <Button type="button" loading={busy === 'retry'} loadingLabel={t('generating')} onClick={() => void retryLetter(selectedPack)}>
                        {t('retry_letter')}
                      </Button>
                    ) : null}
                    <Button type="button" variant="secondary" loading={busy === 'cancel'} onClick={() => void cancelPack(selectedPack)}>
                      {t('cancel_pack')}
                    </Button>
                  </div>
                </InlineNote>
              ) : null}
              {status === 'expired' ? (
                <InlineNote tone="info">
                  <p>{t('status_expired')}</p>
                  <Button type="button" variant="secondary" className="mt-2" loading={busy === 'cancel'} onClick={() => void cancelPack(selectedPack)}>
                    {t('delete_pack')}
                  </Button>
                </InlineNote>
              ) : null}

              {/* Vacancy Snapshot Card */}
              <Card className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-career-line pb-4">
                  <div>
                    <h2 className="text-xl font-bold text-career-ink">{selectedPack.vacancySnapshot.title}</h2>
                    {selectedPack.vacancySnapshot.organization ? (
                      <p className="text-sm font-medium text-career-navy">{selectedPack.vacancySnapshot.organization}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {editedBadge('fit')}
                    <Badge tone={FIT_TONES[selectedPack.fit.fit] || 'neutral'}>
                      {t(`fit_${selectedPack.fit.fit}`)}
                    </Badge>
                    {editButton('fit')}
                  </div>
                </div>

                <div className="mt-4 space-y-4">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-career-muted">{t('vacancy_description')}</h3>
                    <p className="mt-1 text-sm text-career-ink/80 line-clamp-4">{selectedPack.vacancySnapshot.description}</p>
                  </div>

                  {editing === 'fit' ? (
                    <FitEditor
                      initialReasons={[...reasons.tokens.map((token) => t('reason_token', { token })), ...reasons.legacy]}
                      initialGaps={[...gaps.tokens.map((token) => t('gap_token', { token })), ...gaps.legacy]}
                      saving={savingEdit}
                      onSave={(edit) => void saveEdit(selectedPack, edit)}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2">
                      <div className="rounded-md border border-career-line bg-career-surface/50 p-3">
                        <h4 className="text-xs font-semibold text-green-700 dark:text-green-400">
                          ✓ {t('fit_reasons')}
                        </h4>
                        <ul className="mt-1 list-disc pl-4 text-xs text-career-ink/80 space-y-1">
                          {reasons.tokens.map((token) => (
                            <li key={token}>{t('reason_token', { token })}</li>
                          ))}
                          {reasons.legacy.map((r, i) => (
                            <li key={i} dir="auto">{r}</li>
                          ))}
                          {reasons.tokens.length + reasons.legacy.length === 0 ? <li className="list-none">{t('no_reasons')}</li> : null}
                        </ul>
                      </div>
                      <div className="rounded-md border border-career-line bg-career-surface/50 p-3">
                        <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                          ⚠ {t('skill_gaps')}
                        </h4>
                        <ul className="mt-1 list-disc pl-4 text-xs text-career-ink/80 space-y-1">
                          {gaps.tokens.length + gaps.legacy.length > 0 ? (
                            <>
                              {gaps.tokens.map((token) => (
                                <li key={token}>{t('gap_token', { token })}</li>
                              ))}
                              {gaps.legacy.map((g, i) => (
                                <li key={i} dir="auto">{g}</li>
                              ))}
                            </>
                          ) : (
                            <li>{t('no_major_gaps')}</li>
                          )}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              {/* Use the pack: copy into Documents and download (free). */}
              {status === 'complete' ? (
                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-career-ink">{t('export_heading')}</h3>
                  <p className="mt-0.5 text-xs text-career-muted">{t('export_free')}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" loading={busy === 'documents'} onClick={() => void saveDocuments(selectedPack)}>
                      {selectedPack.savedDocuments?.resumeVersionId || selectedPack.savedDocuments?.letterDocumentId ? t('save_documents_again') : t('save_documents')}
                    </Button>
                    <Button type="button" variant="secondary" disabled={busy === 'download'} onClick={() => void download(selectedPack, 'tailoredResume', 'pdf')}>
                      {t('download_resume_pdf')}
                    </Button>
                    <Button type="button" variant="secondary" disabled={busy === 'download'} onClick={() => void download(selectedPack, 'tailoredResume', 'docx')}>
                      {t('download_resume_docx')}
                    </Button>
                    <Button type="button" variant="secondary" disabled={busy === 'download'} onClick={() => void download(selectedPack, 'coverLetter', 'pdf')}>
                      {t('download_letter_pdf')}
                    </Button>
                    <Button type="button" variant="secondary" disabled={busy === 'download'} onClick={() => void download(selectedPack, 'coverLetter', 'docx')}>
                      {t('download_letter_docx')}
                    </Button>
                  </div>
                </Card>
              ) : null}

              {/* Action Checklist Card */}
              <Card className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold text-career-ink">{t('preparation_checklist')}</h3>
                  <div className="flex items-center gap-2">
                    {editedBadge('checklist')}
                    {editButton('checklist')}
                  </div>
                </div>
                <p className="mt-0.5 text-xs text-career-muted">{t('checklist_hint')}</p>

                {editing === 'checklist' ? (
                  <ChecklistEditor
                    items={selectedPack.checklist}
                    labelOf={checklistLabel}
                    saving={savingEdit}
                    onSave={(edit) => void saveEdit(selectedPack, edit)}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
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
                        <span dir="auto" className={`text-sm ${item.done ? 'line-through text-career-muted' : 'text-career-ink'}`}>
                          {checklistLabel(item)}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </Card>

              {/* Tailored Cover Letter Card */}
              <Card className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold text-career-ink">{t('tailored_letter')}</h3>
                  <div className="flex items-center gap-2">
                    {editedBadge('coverLetter')}
                    {editButton('coverLetter')}
                  </div>
                </div>
                {editing === 'coverLetter' && selectedPack.coverLetter ? (
                  <LetterEditor pack={selectedPack} saving={savingEdit} onSave={(edit) => void saveEdit(selectedPack, edit)} onCancel={() => setEditing(null)} />
                ) : selectedPack.coverLetter ? (
                  <div dir="auto" className="mt-3 rounded-md border border-career-line bg-career-wash/30 p-4 font-sans text-sm text-career-ink whitespace-pre-wrap leading-relaxed">
                    {selectedPack.coverLetter.body}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-career-muted">{t('letter_pending')}</p>
                )}
              </Card>

              {/* Tailored Resume Card */}
              <Card className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold text-career-ink">{t('tailored_resume')}</h3>
                  <div className="flex items-center gap-2">
                    {editedBadge('tailoredResume')}
                    {editButton('tailoredResume')}
                  </div>
                </div>
                <p className="mt-0.5 text-xs text-career-muted">{t('resume_facts_used')}: {selectedPack.tailoredResume.factIds.length}</p>
                {selectedPack.tailoredResume.relevance ? (
                  <p className="mt-0.5 text-xs text-career-muted">{t('resume_tailored_hint')}</p>
                ) : null}

                {editing === 'tailoredResume' ? (
                  <ResumeEditor pack={selectedPack} saving={savingEdit} onSave={(edit) => void saveEdit(selectedPack, edit)} onCancel={() => setEditing(null)} />
                ) : (
                  <div className="mt-4 divide-y divide-career-line">
                    {selectedPack.tailoredResume.lines.map((line, idx) => {
                      const matched = selectedPack.tailoredResume.relevance?.[line.factId];
                      return (
                        <div key={idx} className="py-2 text-sm text-career-ink flex items-start gap-2">
                          <span className="text-xs font-semibold text-career-muted uppercase tracking-wider w-20 shrink-0">
                            {line.factType}
                          </span>
                          <span dir="auto">
                            {line.text}
                            {matched && matched.length > 0 ? (
                              <span className="block text-xs text-career-muted">{t('matches', { words: matched.join(', ') })}</span>
                            ) : null}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* Next Steps Card */}
              <Card className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold text-career-ink">{t('next_steps')}</h3>
                  <div className="flex items-center gap-2">
                    {editedBadge('nextSteps')}
                    {editButton('nextSteps')}
                  </div>
                </div>
                {editing === 'nextSteps' ? (
                  <NextStepsEditor initial={nextStepTexts} saving={savingEdit} onSave={(edit) => void saveEdit(selectedPack, edit)} onCancel={() => setEditing(null)} />
                ) : (
                  <ul className="mt-3 list-decimal pl-5 text-sm text-career-ink/90 space-y-2">
                    {/* Codes are derived from the fit, so older packs translate too; the person's own steps are shown as written. */}
                    {nextStepTexts.map((text, index) => (
                      <li key={index} dir="auto">{text}</li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          )}
        </div>
      )}
    </ScreenStack>
  );
}
