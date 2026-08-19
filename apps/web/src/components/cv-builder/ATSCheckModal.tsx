'use client';

import { useState, useId } from 'react';
import { useTranslations } from 'next-intl';
import { useCVStore } from '@/store/cv-store';
import { useAuth } from '@/providers/AuthProvider';
import { api } from '@/lib/api';
import { track } from '@/lib/analytics';
import { serializeCVToText } from '@/lib/serializeCV';
import { extractJsonObject } from '@/lib/ai-json';
import { useModalA11y } from '@/hooks/useModalA11y';
import Button from '@/components/ui/Button';
import UpgradeModal from '@/components/shared/UpgradeModal';
import InAppWarning from '@/components/shared/InAppWarning';
import { X, Target, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PLAN_CONFIGS, resolveEffectivePlan } from '@flacroncv/shared-types';

interface ATSCheckModalProps {
  open: boolean;
  onClose: () => void;
}

interface ATSResult {
  score: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  suggestions: string[];
  overallFeedback: string;
}

// The analyzer returns a JSON object as a string, sometimes wrapped in ```json
// fences. Strip fences and coerce each field defensively.
function parseATS(raw: string): ATSResult | null {
  try {
    const obj = extractJsonObject(raw);
    if (!obj) return null;
    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
    const score = Math.max(0, Math.min(100, Math.round(Number(obj.score) || 0)));
    return {
      score,
      matchedKeywords: arr(obj.matchedKeywords),
      missingKeywords: arr(obj.missingKeywords),
      suggestions: arr(obj.suggestions),
      overallFeedback: typeof obj.overallFeedback === 'string' ? obj.overallFeedback : '',
    };
  } catch {
    return null;
  }
}

function scoreColor(score: number): string {
  if (score >= 75) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

export default function ATSCheckModal({ open, onClose }: ATSCheckModalProps) {
  const t = useTranslations('ats');
  const tcv = useTranslations('cv_builder');
  const tCommon = useTranslations('common');
  const tw = useTranslations('in_app_warnings');
  const { cv, sections } = useCVStore();
  const { user, refreshUser } = useAuth();

  const [jobDescription, setJobDescription] = useState('');
  const [result, setResult] = useState<ATSResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const titleId = useId();

  const handleClose = () => {
    onClose();
    setResult(null);
    setJobDescription('');
  };
  const dialogRef = useModalA11y<HTMLDivElement>(open, handleClose);

  if (!open) return null;

  const creditsUsed = user?.usage?.aiCreditsUsed ?? 0;
  const creditsLimit = Math.min(
    user?.usage?.aiCreditsLimit ?? 5,
    PLAN_CONFIGS[resolveEffectivePlan(user?.subscription)].limits.aiCredits,
  );
  const outOfCredits = creditsUsed >= creditsLimit;

  const handleAnalyze = async () => {
    if (outOfCredits) {
      setShowUpgrade(true);
      return;
    }
    if (!jobDescription.trim()) {
      toast.error(t('jd_required'));
      return;
    }
    if (!cv) return;

    const cvContent = serializeCVToText(cv, sections);
    if (!cvContent.trim()) {
      toast.error(t('empty_cv'));
      return;
    }

    setIsAnalyzing(true);
    try {
      const res = await api.post<{ content: string; provider: string }>('/ai/ats-check', {
        cvContent,
        jobDescription: jobDescription.trim(),
      });
      const parsed = parseATS(res.content);
      if (!parsed) {
        toast.error(t('error'));
        return;
      }
      setResult(parsed);
      track('ai_generation', { feature: 'ats-check' });
      refreshUser();
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      toast.error(message || t('error'), { description: tCommon('generate_failed_no_charge') });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCheckAgain = () => {
    setResult(null);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl outline-none dark:border-stone-700 dark:bg-stone-900"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4 dark:border-stone-700">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-brand-600" />
              <h3 id={titleId} className="text-lg font-semibold text-stone-900 dark:text-white">{t('title')}</h3>
            </div>
            <button
              onClick={handleClose}
              aria-label={tCommon('close')}
              className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <InAppWarning>{tw('ats')}</InAppWarning>
            {!result ? (
              <>
                <p className="text-sm text-stone-500 dark:text-stone-400">{t('subtitle')}</p>
                <div>
                  <label
                    htmlFor="ats-jd"
                    className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300"
                  >
                    {t('jd_label')}
                  </label>
                  <textarea
                    id="ats-jd"
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    placeholder={t('jd_placeholder')}
                    rows={8}
                    className="w-full resize-y rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-stone-600 dark:bg-stone-800 dark:text-white"
                  />
                </div>
              </>
            ) : (
              <div className="space-y-5">
                {/* Score */}
                <div className="flex flex-col items-center gap-1 rounded-xl border border-stone-200 bg-stone-50 py-5 dark:border-stone-700 dark:bg-stone-800/60">
                  <span className={`text-4xl font-bold ${scoreColor(result.score)}`}>
                    {result.score}
                    <span className="text-xl text-stone-400">/100</span>
                  </span>
                  <span className="text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    {t('score_label')}
                  </span>
                </div>

                {result.overallFeedback && (
                  <p className="rounded-lg bg-brand-50 px-3 py-2.5 text-sm text-brand-800 dark:bg-brand-900/20 dark:text-brand-300">
                    {result.overallFeedback}
                  </p>
                )}

                {/* Matched */}
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-stone-700 dark:text-stone-300">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    {t('matched_keywords')}
                  </p>
                  {result.matchedKeywords.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {result.matchedKeywords.map((k) => (
                        <span
                          key={k}
                          className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-stone-400">{t('none_matched')}</p>
                  )}
                </div>

                {/* Missing */}
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-stone-700 dark:text-stone-300">
                    <AlertCircle className="h-4 w-4 text-red-500" />
                    {t('missing_keywords')}
                  </p>
                  {result.missingKeywords.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {result.missingKeywords.map((k) => (
                        <span
                          key={k}
                          className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-300"
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">{t('none_missing')}</p>
                  )}
                </div>

                {/* Suggestions */}
                {result.suggestions.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-stone-700 dark:text-stone-300">
                      {t('suggestions')}
                    </p>
                    <ul className="space-y-1.5">
                      {result.suggestions.map((s) => (
                        <li
                          key={s}
                          className="flex items-start gap-2 text-sm text-stone-600 dark:text-stone-400"
                        >
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-stone-200 px-5 py-3 dark:border-stone-700">
            {!result ? (
              <>
                <span className={`me-auto text-xs ${outOfCredits ? 'text-red-500' : 'text-stone-400'}`}>
                  {outOfCredits ? tcv('no_credits') : tcv('credits_left', { count: creditsLimit - creditsUsed })}
                </span>
                <Button variant="ghost" size="sm" onClick={handleClose}>
                  {tCommon('cancel')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Target className="h-4 w-4" />}
                  loading={isAnalyzing}
                  onClick={handleAnalyze}
                  disabled={outOfCredits}
                >
                  {isAnalyzing ? t('analyzing') : t('analyze')}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RefreshCw className="h-4 w-4" />}
                  onClick={handleCheckAgain}
                >
                  {t('check_again')}
                </Button>
                <Button variant="primary" size="sm" onClick={handleClose}>
                  {tCommon('close')}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <UpgradeModal isOpen={showUpgrade} onClose={() => setShowUpgrade(false)} reason="ai_credits" />
    </>
  );
}
