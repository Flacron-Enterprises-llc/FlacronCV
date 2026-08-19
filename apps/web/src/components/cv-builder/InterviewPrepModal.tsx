'use client';

import { useState, useId } from 'react';
import { useTranslations } from 'next-intl';
import { useCVStore } from '@/store/cv-store';
import { useAuth } from '@/providers/AuthProvider';
import { api } from '@/lib/api';
import { serializeCVToText } from '@/lib/serializeCV';
import { extractJsonObject } from '@/lib/ai-json';
import { useModalA11y } from '@/hooks/useModalA11y';
import Button from '@/components/ui/Button';
import UpgradeModal from '@/components/shared/UpgradeModal';
import InAppWarning from '@/components/shared/InAppWarning';
import { X, MessagesSquare, RefreshCw, MessageSquare, Wrench, HelpCircle, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';
import { PLAN_CONFIGS, resolveEffectivePlan } from '@flacroncv/shared-types';

interface InterviewPrepModalProps {
  open: boolean;
  onClose: () => void;
}

interface InterviewResult {
  behavioral: string[];
  technical: string[];
  questionsToAsk: string[];
  tips: string[];
}

function parseInterview(raw: string): InterviewResult | null {
  try {
    const obj = extractJsonObject(raw);
    if (!obj) return null;
    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
    const result = {
      behavioral: arr(obj.behavioral),
      technical: arr(obj.technical),
      questionsToAsk: arr(obj.questionsToAsk),
      tips: arr(obj.tips),
    };
    // At least one section must have content, else treat as a parse failure.
    if (!result.behavioral.length && !result.technical.length && !result.questionsToAsk.length && !result.tips.length) {
      return null;
    }
    return result;
  } catch {
    return null;
  }
}

export default function InterviewPrepModal({ open, onClose }: InterviewPrepModalProps) {
  const t = useTranslations('interview');
  const tcv = useTranslations('cv_builder');
  const tCommon = useTranslations('common');
  const tw = useTranslations('in_app_warnings');
  const { cv, sections } = useCVStore();
  const { user, refreshUser } = useAuth();

  const [jobDescription, setJobDescription] = useState('');
  const [result, setResult] = useState<InterviewResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
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

  const handleGenerate = async () => {
    if (outOfCredits) {
      setShowUpgrade(true);
      return;
    }
    if (!jobDescription.trim()) {
      toast.error(t('jd_required'));
      return;
    }

    setIsGenerating(true);
    try {
      const cvContent = cv ? serializeCVToText(cv, sections) : '';
      const res = await api.post<{ content: string; provider: string }>('/ai/interview-prep', {
        jobDescription: jobDescription.trim(),
        cvContent,
      });
      const parsed = parseInterview(res.content);
      if (!parsed) {
        toast.error(t('error'));
        return;
      }
      setResult(parsed);
      refreshUser();
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      toast.error(message || t('error'));
    } finally {
      setIsGenerating(false);
    }
  };

  const Section = ({
    icon: Icon,
    title,
    items,
    ordered,
  }: {
    icon: typeof MessageSquare;
    title: string;
    items: string[];
    ordered?: boolean;
  }) => {
    if (!items.length) return null;
    const ListTag = ordered ? 'ol' : 'ul';
    return (
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-stone-700 dark:text-stone-300">
          <Icon className="h-4 w-4 text-brand-500" />
          {title}
        </p>
        <ListTag className={`space-y-1.5 ${ordered ? 'list-decimal ps-5' : ''}`}>
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-stone-600 dark:text-stone-400">
              {!ordered && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />}
              {item}
            </li>
          ))}
        </ListTag>
      </div>
    );
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
          <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4 dark:border-stone-700">
            <div className="flex items-center gap-2">
              <MessagesSquare className="h-5 w-5 text-brand-600" />
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
                    htmlFor="interview-jd"
                    className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300"
                  >
                    {t('jd_label')}
                  </label>
                  <textarea
                    id="interview-jd"
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    placeholder={t('jd_placeholder')}
                    rows={8}
                    className="w-full resize-y rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-stone-600 dark:bg-stone-800 dark:text-white"
                  />
                </div>
              </>
            ) : (
              <>
                <Section icon={MessageSquare} title={t('behavioral')} items={result.behavioral} ordered />
                <Section icon={Wrench} title={t('technical')} items={result.technical} ordered />
                <Section icon={HelpCircle} title={t('questions_to_ask')} items={result.questionsToAsk} />
                <Section icon={Lightbulb} title={t('tips')} items={result.tips} />
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
                  icon={<MessagesSquare className="h-4 w-4" />}
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
