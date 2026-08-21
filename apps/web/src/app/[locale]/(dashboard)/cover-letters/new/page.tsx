'use client';
import React from 'react';

import { useRef, useState } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations, useLocale } from 'next-intl';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/providers/AuthProvider';
import { api, isAiCreditUnconfirmed } from '@/lib/api';
import { serializeCVToText } from '@/lib/serializeCV';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import UpgradeModal from '@/components/shared/UpgradeModal';
import InAppWarning from '@/components/shared/InAppWarning';
import { toast } from 'sonner';
import { track } from '@/lib/analytics';
import { CoverLetter, CV, CVSection, PLAN_CONFIGS, resolveEffectivePlan } from '@flacroncv/shared-types';
import { Sparkles, FileText, ChevronDown, Loader2, AlertTriangle, RefreshCw, Save, X } from 'lucide-react';

const LOCALE_LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French',
  de: 'German',  ar: 'Arabic',  ur: 'Urdu',
};

/** Must match the tone values the API prompt understands. */
const TONES = ['professional', 'friendly', 'enthusiastic', 'formal'] as const;
/** Must match AIService's COVER_LETTER_LENGTHS keys. */
const LENGTHS = ['short', 'medium', 'long'] as const;

type Tone = (typeof TONES)[number];
type Length = (typeof LENGTHS)[number];

interface CreateCoverLetterPayload {
  title: string;
  recipientName?: string;
  companyName?: string;
  jobTitle?: string;
  jobDescription?: string;
  linkedCVId?: string;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The model returns plain text with blank-line paragraph breaks, but the letter
 * is stored (and edited) as the rich-text editor's HTML. Converting here keeps
 * real <p> nodes in the document — which is also what makes single-paragraph
 * regeneration in the editor possible. Escaped because the job description the
 * user pasted flows into this text.
 */
function textToParagraphHtml(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br />')}</p>`)
    .join('');
}

export default function NewCoverLetterPage(): React.JSX.Element | null {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { user, refreshUser } = useAuth();

  const [title, setTitle] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [linkedCVId, setLinkedCVId] = useState('');
  const [tone, setTone] = useState<Tone>('professional');
  const [length, setLength] = useState<Length>('medium');
  // The generated letter, held on the client for review. Nothing is persisted
  // and nothing is sent anywhere until the user explicitly saves it.
  const [draft, setDraft] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // If the blank create succeeded but writing the content back failed, reuse
  // the same document on retry instead of stacking duplicate cover letters.
  const createdIdRef = useRef<string | null>(null);

  // Fetch existing CVs for the dropdown
  const { data: cvsData } = useQuery({
    queryKey: ['cvs'],
    queryFn: () => api.get<{ items: CV[] }>('/cvs'),
  });

  const cvs = cvsData?.items || [];

  /** True when the user still has AI credits; opens the paywall when not. */
  const ensureAICredits = (): boolean => {
    const aiCreditsUsed = user?.usage?.aiCreditsUsed || 0;
    const aiCreditsLimit = Math.min(
      user?.usage?.aiCreditsLimit || 5,
      PLAN_CONFIGS[resolveEffectivePlan(user?.subscription)].limits.aiCredits,
    );
    if (aiCreditsUsed >= aiCreditsLimit) {
      setShowUpgradeModal(true);
      return false;
    }
    return true;
  };

  const createMutation = useMutation({
    mutationFn: (data: CreateCoverLetterPayload) => api.post<CoverLetter>('/cover-letters', data),
    onSuccess: (coverLetter) => {
      toast.success(t('coverLetters.created'));
      track('cover_letter_created', { withAI: false });
      router.push(`/cover-letters/${coverLetter.id}`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const generateJobDescMutation = useMutation({
    mutationFn: (data: { jobTitle: string; companyName?: string }) =>
      api.post<{ content: string }>('/ai/generate-job-description', {
        ...data,
        language: LOCALE_LANGUAGE_NAMES[locale] || 'English',
      }),
    onSuccess: (data) => {
      setJobDescription(data.content);
      toast.success(t('coverLetters.job_description_generated'));
      track('ai_generation', { feature: 'generate-job-description' });
      refreshUser();
    },
    onError: (error: Error) => {
      refreshUser();
      toast.error(error.message, {
        description: t(
          isAiCreditUnconfirmed(error)
            ? 'common.generate_failed_charge_unconfirmed'
            : 'common.generate_failed_no_charge',
        ),
      });
    },
  });

  const generateJobDescription = () => {
    if (!jobTitle.trim()) {
      toast.error(t('coverLetters.job_title_required_for_ai'));
      return;
    }
    if (!ensureAICredits()) return;

    generateJobDescMutation.mutate({
      jobTitle: jobTitle.trim(),
      companyName: companyName.trim() || undefined,
    });
  };

  /**
   * Generate the letter WITHOUT creating anything: the draft is returned to the
   * browser for review. A failed generation therefore leaves no empty document
   * and no consumed cover-letter quota behind, and the AI credit is refunded
   * server-side.
   */
  const generateMutation = useMutation({
    mutationFn: async (vars: { tone: Tone; length: Length }) => {
      let candidateSummary = '';
      if (linkedCVId) {
        try {
          const [cv, sections] = await Promise.all([
            api.get<CV>(`/cvs/${linkedCVId}`),
            api.get<CVSection[]>(`/cvs/${linkedCVId}/sections`),
          ]);
          candidateSummary = serializeCVToText(cv, sections);
        } catch {
          // A CV that can't be read shouldn't block generation — the letter is
          // simply written from the job details alone.
          candidateSummary = '';
        }
      }

      const result = await api.post<{ content: string }>('/ai/cover-letter', {
        jobTitle: jobTitle.trim(),
        jobDescription: jobDescription.trim(),
        companyName: companyName.trim(),
        candidateSummary,
        tone: vars.tone,
        length: vars.length,
        language: LOCALE_LANGUAGE_NAMES[locale] || 'English',
      });
      return result.content;
    },
    onSuccess: (content) => {
      setDraft(content.trim());
      track('ai_generation', { feature: 'cover-letter' });
      refreshUser();
    },
    onError: () => {
      // A failed generation refunds its credit server-side, so the balance in
      // the header must be re-read rather than left stale. The inline panel
      // below carries the message and the Retry action.
      refreshUser();
    },
  });

  /** Persist the reviewed draft: create the letter, then write the content in. */
  const saveDraftMutation = useMutation({
    mutationFn: async (content: string) => {
      let id = createdIdRef.current;
      if (!id) {
        const created = await api.post<CoverLetter>('/cover-letters', {
          title: title.trim(),
          recipientName: recipientName.trim() || undefined,
          companyName: companyName.trim() || undefined,
          jobTitle: jobTitle.trim() || undefined,
          jobDescription: jobDescription.trim() || undefined,
          linkedCVId: linkedCVId || undefined,
        });
        id = created.id;
        createdIdRef.current = id;
      }
      await api.put(`/cover-letters/${id}`, { content: textToParagraphHtml(content) });
      return id;
    },
    onSuccess: (id) => {
      toast.success(t('coverLetters.created'));
      track('cover_letter_created', { withAI: true });
      router.push(`/cover-letters/${id}`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const startGeneration = () => {
    // Belt-and-braces against duplicate generation from repeated clicks. The
    // button is already disabled while pending, but a fast double-click can
    // land two events before React re-renders — and each one spends a credit.
    if (generateMutation.isPending) return;

    if (!title.trim()) {
      toast.error(t('coverLetters.title_required'));
      return;
    }
    if (!jobTitle.trim() || !companyName.trim()) {
      toast.error(t('coverLetters.ai_fields_required'));
      return;
    }
    if (!ensureAICredits()) return;

    generateMutation.mutate({ tone, length });
  };

  const createBlank = () => {
    if (createMutation.isPending) return;
    if (!title.trim()) {
      toast.error(t('coverLetters.title_required'));
      return;
    }
    createMutation.mutate({
      title: title.trim(),
      recipientName: recipientName.trim() || undefined,
      companyName: companyName.trim() || undefined,
      jobTitle: jobTitle.trim() || undefined,
      jobDescription: jobDescription.trim() || undefined,
      linkedCVId: linkedCVId || undefined,
    });
  };

  const busy =
    createMutation.isPending || generateMutation.isPending || saveDraftMutation.isPending;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-stone-900 dark:text-white">
        {t('coverLetters.create_new')}
      </h1>

      <div className="space-y-6">
        {/* Basic info */}
        <Card>
          <h3 className="mb-4 font-semibold text-stone-900 dark:text-white">
            {t('coverLetters.basic_info')}
          </h3>
          <div className="space-y-4">
            <Input
              id="title"
              label={t('coverLetters.field_title')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('coverLetters.title_placeholder')}
              required
            />
            <Input
              id="recipientName"
              label={t('coverLetters.field_recipient')}
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder={t('coverLetters.recipient_placeholder')}
            />
          </div>
        </Card>

        {/* Job details */}
        <Card>
          <h3 className="mb-4 font-semibold text-stone-900 dark:text-white">
            {t('coverLetters.job_details')}
          </h3>
          <div className="space-y-4">
            <Input
              id="companyName"
              label={t('coverLetters.field_company')}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder={t('coverLetters.company_placeholder')}
            />
            <Input
              id="jobTitle"
              label={t('coverLetters.field_job_title')}
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder={t('coverLetters.job_title_placeholder')}
            />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="jobDescription"
                  className="block text-sm font-medium text-stone-700 dark:text-stone-300"
                >
                  {t('coverLetters.field_job_description')}
                </label>
                <button
                  type="button"
                  onClick={() => generateJobDescription()}
                  disabled={!jobTitle.trim() || generateJobDescMutation.isPending}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-50 disabled:cursor-not-allowed dark:text-brand-400 dark:hover:bg-brand-900/20"
                >
                  {generateJobDescMutation.isPending ? (
                    <>
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-brand-600 border-t-transparent dark:border-brand-400" />
                      {t('coverLetters.generating')}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3" />
                      {t('coverLetters.generate_ai_description')}
                    </>
                  )}
                </button>
              </div>
              <textarea
                id="jobDescription"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder={t('coverLetters.job_description_placeholder')}
                rows={4}
                className="input-field resize-none"
              />
              <p className="text-xs text-stone-500">
                {t('coverLetters.job_description_hint')}
              </p>
            </div>
          </div>
        </Card>

        {/* Link to CV */}
        <Card>
          <h3 className="mb-4 font-semibold text-stone-900 dark:text-white">
            {t('coverLetters.link_cv')}
          </h3>
          <p className="mb-3 text-sm text-stone-500">
            {t('coverLetters.link_cv_description')}
          </p>
          <div className="relative">
            <select
              id="linkedCVId"
              value={linkedCVId}
              onChange={(e) => setLinkedCVId(e.target.value)}
              aria-label={t('coverLetters.link_cv')}
              className="input-field appearance-none pe-10"
            >
              <option value="">{t('coverLetters.no_cv_selected')}</option>
              {cvs.map((cv) => (
                <option key={cv.id} value={cv.id}>
                  {cv.title}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          </div>
        </Card>

        {/* How the AI should write it */}
        <Card>
          <h3 className="mb-1 font-semibold text-stone-900 dark:text-white">
            {t('coverLetters.ai_options')}
          </h3>
          <p className="mb-4 text-sm text-stone-500">
            {t('coverLetters.ai_options_description')}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="tone"
                className="block text-sm font-medium text-stone-700 dark:text-stone-300"
              >
                {t('cover_letter.tone')}
              </label>
              <div className="relative">
                <select
                  id="tone"
                  value={tone}
                  onChange={(e) => setTone(e.target.value as Tone)}
                  className="input-field appearance-none pe-10"
                >
                  {TONES.map((value) => (
                    <option key={value} value={value}>
                      {/* cover_letter.tones.* already exists in every locale —
                          reused rather than adding a parallel set of keys. */}
                      {t(`cover_letter.tones.${value}`)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="length"
                className="block text-sm font-medium text-stone-700 dark:text-stone-300"
              >
                {t('coverLetters.field_length')}
              </label>
              <div className="relative">
                <select
                  id="length"
                  value={length}
                  onChange={(e) => setLength(e.target.value as Length)}
                  className="input-field appearance-none pe-10"
                  aria-describedby="length-hint"
                >
                  {LENGTHS.map((value) => (
                    <option key={value} value={value}>
                      {t(`coverLetters.length_${value}`)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              </div>
              <p id="length-hint" className="text-xs text-stone-500">
                {t('coverLetters.length_hint')}
              </p>
            </div>
          </div>
        </Card>

        {/* AI generation progress. A spinner inside the button alone gave no
            sense of how long to wait, so a slow generation read as a hang. */}
        {generateMutation.isPending && (
          <Card
            role="status"
            aria-live="polite"
            className="border-brand-200 bg-brand-50/60 dark:border-brand-900 dark:bg-brand-950/30"
          >
            <div className="flex items-center gap-4">
              <Loader2 className="h-6 w-6 shrink-0 animate-spin text-brand-600 dark:text-brand-400" />
              <div className="min-w-0">
                <p className="font-medium text-stone-900 dark:text-white">
                  {t('coverLetters.generating_title')}
                </p>
                <p className="mt-0.5 text-sm text-stone-600 dark:text-stone-400">
                  {t('coverLetters.generating_hint')}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Failure + explicit retry. Description depends on whether the API
            confirmed the reserved credit was returned. */}
        {generateMutation.isError && !generateMutation.isPending && (
          <Card role="alert" className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <AlertTriangle className="h-6 w-6 shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-stone-900 dark:text-white">
                  {t('coverLetters.generate_failed_title')}
                </p>
                <p className="mt-0.5 text-sm text-stone-600 dark:text-stone-400">
                  {generateMutation.error?.message}
                </p>
                <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
                  {t(
                    isAiCreditUnconfirmed(generateMutation.error)
                      ? 'coverLetters.generate_failed_charge_unconfirmed'
                      : 'coverLetters.generate_failed_no_charge',
                  )}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={startGeneration}
                icon={<RefreshCw className="h-4 w-4" />}
              >
                {t('coverLetters.retry')}
              </Button>
            </div>
          </Card>
        )}

        {/* Review step — the draft lives only in the browser until saved. */}
        {draft !== null && !generateMutation.isPending && (
          <Card className="border-brand-200 dark:border-brand-900">
            <h3 className="font-semibold text-stone-900 dark:text-white">
              {t('coverLetters.review_title')}
            </h3>
            <p className="mt-1 text-sm text-stone-500">{t('coverLetters.review_hint')}</p>
            <div className="mt-4 space-y-1.5">
              <label
                htmlFor="generatedDraft"
                className="block text-sm font-medium text-stone-700 dark:text-stone-300"
              >
                {t('coverLetters.review_label')}
              </label>
              <textarea
                id="generatedDraft"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={16}
                className="input-field resize-y font-serif leading-relaxed"
              />
            </div>
          </Card>
        )}

        <InAppWarning>{t('in_app_warnings.cover_letter')}</InAppWarning>

        {/* Action buttons */}
        {draft !== null && !generateMutation.isPending ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button
              variant="ghost"
              type="button"
              disabled={busy}
              onClick={() => setDraft(null)}
              icon={<X className="h-4 w-4" />}
            >
              {t('coverLetters.discard_draft')}
            </Button>
            <Button
              variant="outline"
              type="button"
              disabled={busy}
              onClick={startGeneration}
              icon={<RefreshCw className="h-4 w-4" />}
            >
              {t('coverLetters.regenerate')}
            </Button>
            <Button
              loading={saveDraftMutation.isPending}
              disabled={busy || !draft.trim()}
              onClick={() => saveDraftMutation.mutate(draft)}
              icon={<Save className="h-4 w-4" />}
            >
              {t('coverLetters.save_letter')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" type="button" disabled={busy} onClick={() => router.back()}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="outline"
              loading={createMutation.isPending}
              disabled={busy}
              onClick={createBlank}
              icon={<FileText className="h-4 w-4" />}
            >
              {t('coverLetters.create_blank')}
            </Button>
            <Button
              loading={generateMutation.isPending}
              disabled={busy}
              onClick={startGeneration}
              icon={<Sparkles className="h-4 w-4" />}
            >
              {t('coverLetters.generate_with_ai')}
            </Button>
          </div>
        )}
      </div>

      {/* Upgrade Modal */}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        reason="ai_credits"
      />
    </div>
  );
}
