'use client';

import { useCVStore } from '@/store/cv-store';
import { useTranslations, useLocale } from 'next-intl';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import UpgradeModal from '@/components/shared/UpgradeModal';
import InAppWarning from '@/components/shared/InAppWarning';
import { api } from '@/lib/api';
import { exportToPDF, exportToDocx } from '@/lib/export-cv';
import { useAuth } from '@/providers/AuthProvider';
import { SubscriptionPlan, resolveEffectivePlan } from '@flacroncv/shared-types';
import DocxUpgradeModal from '@/components/cv-builder/DocxUpgradeModal';
import { track } from '@/lib/analytics';
import { fcgeTrack } from '@/lib/fcge';
import { TOUR_TARGETS } from '@/lib/app-tour';
import {
  Undo2,
  Redo2,
  Download,
  Check,
  Loader2,
  FileText,
  FileSpreadsheet,
  Target,
  MessagesSquare,
  Linkedin,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';
import FontPanel from './FontPanel';
import TemplatePanel from './TemplatePanel';
import ATSCheckModal from '@/components/cv-builder/ATSCheckModal';
import InterviewPrepModal from '@/components/cv-builder/InterviewPrepModal';
import LinkedInModal from '@/components/cv-builder/LinkedInModal';

interface EditorToolbarProps {
  cvId: string;
}

export default function EditorToolbar({ cvId }: EditorToolbarProps) {
  const t = useTranslations('cv_builder');
  const tats = useTranslations('ats');
  const tint = useTranslations('interview');
  const tli = useTranslations('linkedin');
  const tw = useTranslations('in_app_warnings');
  const locale = useLocale();
  const { cv, sections, isDirty, isSaving, lastSavedAt, undo, redo, canUndo, canRedo, updateTitle } = useCVStore();
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showDocxUpgrade, setShowDocxUpgrade] = useState(false);
  const { user, degraded, placeholderAccount } = useAuth();
  // DOCX is a paid feature. Marked in the menu up front, and a Free user's
  // click goes straight to an explanation instead of a doomed reservation.
  // While the profile is degraded/placeholder (API blip) the plan is unknown,
  // so nothing is locked client-side and the server's answer decides.
  const docxLocked = Boolean(user) && !degraded && !placeholderAccount
    && resolveEffectivePlan(user?.subscription) === SubscriptionPlan.FREE;
  const [showATS, setShowATS] = useState(false);
  const [showInterview, setShowInterview] = useState(false);
  const [showLinkedIn, setShowLinkedIn] = useState(false);

  const handleExport = async (format: 'pdf' | 'docx') => {
    if (!cv) return;
    if (format === 'docx' && docxLocked) {
      setExportOpen(false);
      setShowDocxUpgrade(true);
      return;
    }
    setExporting(true);
    let reservationId: string | undefined;
    try {
      // Reserve first (server enforces DOCX-is-paid + quota). Charge is held
      // until confirm after a successful file, or refunded if render fails.
      const decision = await api.post<{
        allowed: boolean;
        reason?: string;
        reservationId?: string;
        removeBranding?: boolean;
      }>('/exports/record', { format, type: 'cv', documentId: cv.id });
      if (!decision.allowed) {
        // The server says WHY. "DOCX needs a paid plan" (plan state changed
        // since this page loaded) is not "you have no exports left".
        if (decision.reason === 'docx_requires_paid') setShowDocxUpgrade(true);
        else setShowUpgrade(true);
        return;
      }
      reservationId = decision.reservationId;
      if (format === 'pdf') {
        // Free exports carry the small "Made with FlacronCV" mark; the server decides.
        await exportToPDF(cv, sections, locale, { brandingMark: decision.removeBranding === false });
      } else {
        // Headings, dates and "Present" follow the CV's own language — the
        // same resolution the preview uses — so the DOCX matches the PDF.
        await exportToDocx(cv, sections, locale);
      }
      if (reservationId) {
        await api.post('/exports/confirm', {
          reservationId,
          format,
          type: 'cv',
          documentId: cv.id,
        });
      }
      toast.success(t('export_success', { format: format.toUpperCase() }));
      track('cv_exported', { format });
      fcgeTrack('feature_used', { feature: 'resume_exported' });
    } catch (error) {
      console.error('Export error:', error);
      if (reservationId) {
        try {
          await api.post('/exports/refund', { reservationId });
        } catch {
          /* refund best-effort — never mask the export failure */
        }
      }
      toast.error(t('export_failed'));
    } finally {
      setExporting(false);
      setExportOpen(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-y-2 border-b border-stone-200 bg-white px-2 py-2 sm:px-4 dark:border-stone-700 dark:bg-stone-900">
      <div className="flex min-w-0 items-center gap-2">
        <input
          type="text"
          value={cv?.title ?? ''}
          onChange={(e) => updateTitle(e.target.value)}
          className="min-w-0 w-32 border-none bg-transparent text-sm font-semibold text-stone-900 outline-none focus:ring-0 sm:w-52 dark:text-white"
          placeholder={t('untitled_cv')}
          aria-label={t('new_title_label')}
        />
        {isSaving ? (
          <Badge variant="warning">
            <Loader2 className="me-1 h-3 w-3 animate-spin" />
            {t('saving')}
          </Badge>
        ) : isDirty ? (
          <Badge variant="warning">{t('unsaved')}</Badge>
        ) : lastSavedAt ? (
          <Badge variant="success">
            <Check className="me-1 h-3 w-3" />
            {t('saved')}
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={undo} disabled={!canUndo()} title={t('undo')}>
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={redo} disabled={!canRedo()} title={t('redo')}>
          <Redo2 className="h-4 w-4" />
        </Button>

        <div className="mx-2 h-6 w-px bg-stone-200 dark:bg-stone-700" />

        <FontPanel />

        <div className="mx-1 h-6 w-px bg-stone-200 dark:bg-stone-700" />

        <TemplatePanel />

        <div className="mx-1 h-6 w-px bg-stone-200 dark:bg-stone-700" />

        <Button
          variant="ghost"
          size="sm"
          icon={<Target className="h-4 w-4" />}
          onClick={() => setShowATS(true)}
          title={tats('button')}
          data-tour={TOUR_TARGETS.editorAts}
        >
          {tats('button')}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          icon={<MessagesSquare className="h-4 w-4" />}
          onClick={() => setShowInterview(true)}
          title={tint('button')}
        >
          {tint('button')}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          icon={<Linkedin className="h-4 w-4" />}
          onClick={() => setShowLinkedIn(true)}
          title={tli('button')}
        >
          {tli('button')}
        </Button>

        <div className="relative">
          <Button
            variant="primary"
            size="sm"
            icon={<Download className="h-4 w-4" />}
            loading={exporting}
            onClick={() => setExportOpen(!exportOpen)}
            data-tour={TOUR_TARGETS.editorExport}
          >
            {t('export')}
          </Button>
          {exportOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
              {/* The two formats are NOT interchangeable and the difference
                  matters to the user's outcome: the PDF is produced by
                  html2canvas → a PNG placed in the page (export-cv.ts), so it
                  carries no extractable text and an applicant tracking system
                  cannot read a word of it. The DOCX is built from real
                  Paragraph/TextRun content and parses correctly. Say so at the
                  point of choice rather than claiming "ATS-optimized" globally. */}
              <div className="absolute end-0 z-20 mt-1 w-72 rounded-lg border border-stone-200 bg-white py-1 shadow-lg dark:border-stone-700 dark:bg-stone-800">
                <div className="px-2 pt-2 pb-1">
                  <InAppWarning>
                    <strong className="block">{tw('export_title')}</strong>
                    {tw('export_body')}
                  </InAppWarning>
                </div>
                <button
                  className="flex w-full items-start gap-2 px-3 py-2 text-start text-sm text-stone-600 hover:bg-stone-50 dark:text-stone-400 dark:hover:bg-stone-700"
                  onClick={() => handleExport('pdf')}
                >
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <span className="min-w-0">
                    {t('export_pdf')}
                    <span className="block text-xs text-stone-400">{t('export_pdf_hint')}</span>
                  </span>
                </button>
                <button
                  className="flex w-full items-start gap-2 px-3 py-2 text-start text-sm text-stone-600 hover:bg-stone-50 dark:text-stone-400 dark:hover:bg-stone-700"
                  onClick={() => handleExport('docx')}
                >
                  <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                  <span className="min-w-0 flex-1">
                    {t('export_docx')}
                    <span className="block text-xs text-stone-400">{t('export_docx_hint')}</span>
                  </span>
                  {docxLocked && (
                    <span
                      className="ms-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                      data-testid="docx-pro-badge"
                    >
                      <Lock className="h-3 w-3" aria-hidden="true" />
                      {t('docx_pro_badge')}
                    </span>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <ATSCheckModal open={showATS} onClose={() => setShowATS(false)} />

      <InterviewPrepModal open={showInterview} onClose={() => setShowInterview(false)} />

      <LinkedInModal open={showLinkedIn} onClose={() => setShowLinkedIn(false)} />

      <UpgradeModal
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        reason="exports"
      />

      <DocxUpgradeModal isOpen={showDocxUpgrade} onClose={() => setShowDocxUpgrade(false)} />
    </div>
  );
}
