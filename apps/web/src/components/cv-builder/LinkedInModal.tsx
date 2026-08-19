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
import { X, Linkedin, RefreshCw, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { PLAN_CONFIGS, resolveEffectivePlan } from '@flacroncv/shared-types';

interface LinkedInModalProps {
  open: boolean;
  onClose: () => void;
}

interface LinkedInResult {
  headline: string;
  about: string;
  skills: string[];
  tips: string[];
}

function parseLinkedIn(raw: string): LinkedInResult | null {
  try {
    const obj = extractJsonObject(raw);
    if (!obj) return null;
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
    const result = {
      headline: str(obj.headline),
      about: str(obj.about),
      skills: arr(obj.skills),
      tips: arr(obj.tips),
    };
    if (!result.headline && !result.about && !result.skills.length) return null;
    return result;
  } catch {
    return null;
  }
}

export default function LinkedInModal({ open, onClose }: LinkedInModalProps) {
  const t = useTranslations('linkedin');
  const tcv = useTranslations('cv_builder');
  const tCommon = useTranslations('common');
  const tw = useTranslations('in_app_warnings');
  const { cv, sections } = useCVStore();
  const { user, refreshUser } = useAuth();

  const [targetRole, setTargetRole] = useState('');
  const [result, setResult] = useState<LinkedInResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const titleId = useId();

  const handleClose = () => {
    onClose();
    setResult(null);
    setTargetRole('');
  };
  const dialogRef = useModalA11y<HTMLDivElement>(open, handleClose);

  if (!open) return null;

  const creditsUsed = user?.usage?.aiCreditsUsed ?? 0;
  const creditsLimit = Math.min(
    user?.usage?.aiCreditsLimit ?? 5,
    PLAN_CONFIGS[resolveEffectivePlan(user?.subscription)].limits.aiCredits,
  );
  const outOfCredits = creditsUsed >= creditsLimit;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('copied'));
    } catch {
      // Clipboard may be unavailable (insecure context) — fail silently.
    }
  };

  const handleGenerate = async () => {
    if (outOfCredits) {
      setShowUpgrade(true);
      return;
    }
    const cvContent = cv ? serializeCVToText(cv, sections) : '';
    if (!cvContent.trim()) {
      toast.error(t('empty_cv'));
      return;
    }

    setIsGenerating(true);
    try {
      const res = await api.post<{ content: string; provider: string }>('/ai/linkedin', {
        cvContent,
        targetRole: targetRole.trim() || undefined,
      });
      const parsed = parseLinkedIn(res.content);
      if (!parsed) {
        toast.error(t('error'));
        return;
      }
      setResult(parsed);
      track('ai_generation', { feature: 'linkedin' });
      refreshUser();
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      toast.error(message || t('error'), { description: tCommon('generate_failed_no_charge') });
    } finally {
      setIsGenerating(false);
    }
  };

  const CopyButton = ({ text }: { text: string }) => (
    <button
      type="button"
      onClick={() => copy(text)}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-900/20"
    >
      <Copy className="h-3.5 w-3.5" />
      {t('copy')}
    </button>
  );

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
          <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4 dark:border-stone-700">
            <div className="flex items-center gap-2">
              <Linkedin className="h-5 w-5 text-brand-600" />
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

          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
            <InAppWarning>{tw('ai')}</InAppWarning>
            {!result ? (
              <>
                <p className="text-sm text-stone-500 dark:text-stone-400">{t('subtitle')}</p>
                <div>
                  <label
                    htmlFor="li-role"
                    className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300"
                  >
                    {t('role_label')}
                  </label>
                  <input
                    id="li-role"
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    placeholder={t('role_placeholder')}
                    className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-stone-600 dark:bg-stone-800 dark:text-white"
                  />
                </div>
              </>
            ) : (
              <>
                {result.headline && (
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">{t('headline')}</p>
                      <CopyButton text={result.headline} />
                    </div>
                    <p className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300">
                      {result.headline}
                    </p>
                  </div>
                )}

                {result.about && (
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">{t('about')}</p>
                      <CopyButton text={result.about} />
                    </div>
                    <p className="whitespace-pre-wrap rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300">
                      {result.about}
                    </p>
                  </div>
                )}

                {result.skills.length > 0 && (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">{t('skills')}</p>
                      <CopyButton text={result.skills.join(', ')} />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {result.skills.map((s) => (
                        <span
                          key={s}
                          className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-800 dark:bg-brand-900/40 dark:text-brand-300"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {result.tips.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-stone-700 dark:text-stone-300">{t('tips')}</p>
                    <ul className="space-y-1.5">
                      {result.tips.map((tip) => (
                        <li
                          key={tip}
                          className="flex items-start gap-2 text-sm text-stone-600 dark:text-stone-400"
                        >
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>

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
                  icon={<Linkedin className="h-4 w-4" />}
                  loading={isGenerating}
                  onClick={handleGenerate}
                  disabled={outOfCredits}
                >
                  {isGenerating ? t('generating') : t('generate')}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RefreshCw className="h-4 w-4" />}
                  onClick={() => setResult(null)}
                >
                  {t('again')}
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
