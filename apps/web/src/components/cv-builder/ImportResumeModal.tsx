'use client';

import { useState, useId, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useModalA11y } from '@/hooks/useModalA11y';
import { useAuth } from '@/providers/AuthProvider';
import { api, isAiCreditUnconfirmed } from '@/lib/api';
import { track } from '@/lib/analytics';
import { extractResumeText, ResumeExtractError, RESUME_UPLOAD_ACCEPT } from '@/lib/extractResumeText';
import Button from '@/components/ui/Button';
import UpgradeModal from '@/components/shared/UpgradeModal';
import { X, Upload, FileUp } from 'lucide-react';
import { toast } from 'sonner';
import { PLAN_CONFIGS, resolveEffectivePlan, type CV } from '@flacroncv/shared-types';
import { CV_NEW_DRAFT_KEY as DRAFT_KEY } from '@/app/[locale]/(dashboard)/cv/new/constants';

interface ImportResumeModalProps {
  open: boolean;
  onClose: () => void;
  /** Optional title from the "CV Details" step; the backend defaults it otherwise. */
  title?: string;
}

export default function ImportResumeModal({ open, onClose, title }: ImportResumeModalProps) {
  const t = useTranslations('resume_import');
  const tcv = useTranslations('cv_builder');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { user, refreshUser } = useAuth();

  const [resumeText, setResumeText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  const handleClose = () => {
    if (isImporting) return;
    onClose();
    setResumeText('');
  };
  const dialogRef = useModalA11y<HTMLDivElement>(open, handleClose);

  if (!open) return null;

  const creditsUsed = user?.usage?.aiCreditsUsed ?? 0;
  const creditsLimit = Math.min(
    user?.usage?.aiCreditsLimit ?? 5,
    PLAN_CONFIGS[resolveEffectivePlan(user?.subscription)].limits.aiCredits,
  );
  const outOfCredits = creditsUsed >= creditsLimit;

  // File upload → client-side text extraction (PDF via pdfjs, DOCX via mammoth)
  // → drops the text into the same paste box the user can review before import.
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = ''; // allow re-selecting the same file
    if (!file) return;
    setExtracting(true);
    try {
      const text = await extractResumeText(file);
      setResumeText(text);
      toast.success(t('extracted', { name: file.name }));
    } catch (err) {
      const code = err instanceof ResumeExtractError ? err.code : 'failed';
      toast.error(t(`extract_error.${code}`));
    } finally {
      setExtracting(false);
    }
  };

  const handleImport = async () => {
    if (outOfCredits) {
      setShowUpgrade(true);
      return;
    }
    if (!resumeText.trim()) {
      toast.error(t('paste_required'));
      return;
    }

    setIsImporting(true);
    try {
      const cv = await api.post<CV>('/cvs/import', {
        title: title?.trim() || undefined,
        resumeText: resumeText.trim(),
      });
      sessionStorage.removeItem(DRAFT_KEY);
      refreshUser();
      track('cv_created', { source: 'import' });
      track('ai_generation', { feature: 'resume-import' });
      toast.success(t('success'));
      router.push(`/cv/${cv.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      toast.error(message || t('error'), {
        description: tCommon(
          isAiCreditUnconfirmed(error)
            ? 'generate_failed_charge_unconfirmed'
            : 'generate_failed_no_charge',
        ),
      });
      setIsImporting(false);
    }
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
              <Upload className="h-5 w-5 text-brand-600" />
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
            <p className="text-sm text-stone-500 dark:text-stone-400">{t('subtitle')}</p>

            {/* Upload a file (PDF/DOCX) — extracted client-side into the box below */}
            <div className="space-y-1.5">
              <input
                ref={fileInputRef}
                id="import-resume-file"
                type="file"
                accept={RESUME_UPLOAD_ACCEPT}
                onChange={handleFile}
                className="sr-only"
              />
              <Button
                variant="secondary"
                size="sm"
                type="button"
                icon={<FileUp className="h-4 w-4" />}
                loading={extracting}
                disabled={extracting || isImporting}
                onClick={() => fileInputRef.current?.click()}
              >
                {extracting ? t('extracting') : t('upload_button')}
              </Button>
              <p className="text-xs text-stone-400 dark:text-stone-500">{t('upload_hint')}</p>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 text-xs text-stone-400 dark:text-stone-500">
              <span className="h-px flex-1 bg-stone-200 dark:bg-stone-700" />
              {t('or_paste')}
              <span className="h-px flex-1 bg-stone-200 dark:bg-stone-700" />
            </div>

            <div>
              <label
                htmlFor="import-resume"
                className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300"
              >
                {t('paste_label')}
              </label>
              <textarea
                id="import-resume"
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                placeholder={t('paste_placeholder')}
                rows={10}
                className="w-full resize-y rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-stone-600 dark:bg-stone-800 dark:text-white"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-stone-200 px-5 py-3 dark:border-stone-700">
            <span className={`me-auto text-xs ${outOfCredits ? 'text-red-500' : 'text-stone-400'}`}>
              {outOfCredits ? tcv('no_credits') : tcv('credits_left', { count: creditsLimit - creditsUsed })}
            </span>
            <Button variant="ghost" size="sm" onClick={handleClose} disabled={isImporting}>
              {tCommon('cancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Upload className="h-4 w-4" />}
              loading={isImporting}
              onClick={handleImport}
              disabled={outOfCredits}
            >
              {isImporting ? t('importing') : t('import_button')}
            </Button>
          </div>
        </div>
      </div>

      <UpgradeModal isOpen={showUpgrade} onClose={() => setShowUpgrade(false)} reason="ai_credits" />
    </>
  );
}
