'use client';

import { useCVStore } from '@/store/cv-store';
import { useTranslations, useLocale } from 'next-intl';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import UpgradeModal from '@/components/shared/UpgradeModal';
import InAppWarning from '@/components/shared/InAppWarning';
import { api } from '@/lib/api';
import { exportToPDF, exportToDocx, type DocxLabels } from '@/lib/export-cv';
import { track } from '@/lib/analytics';
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
  const { cv, sections, isDirty, isSaving, lastSavedAt, undo, redo, canUndo, canRedo } = useCVStore();
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showATS, setShowATS] = useState(false);
  const [showInterview, setShowInterview] = useState(false);
  const [showLinkedIn, setShowLinkedIn] = useState(false);

  const handleExport = async (format: 'pdf' | 'docx') => {
    if (!cv) return;
    setExporting(true);
    try {
      // Server-authorized: enforces DOCX-is-paid + the monthly export quota and
      // records usage. The file itself is still generated client-side below.
      const decision = await api.post<{ allowed: boolean; reason?: string }>(
        '/exports/record',
        { format, type: 'cv' },
      );
      if (!decision.allowed) {
        setShowUpgrade(true);
        return;
      }
      if (format === 'pdf') {
        await exportToPDF(cv, sections, locale);
      } else {
        // Labels come directly from next-intl — same strings as the editor,
        // correct language with no static fallback table.
        const labels: DocxLabels = {
          professionalSummary: t('template_professional_summary'),
          profile:             t('template_profile'),
          contact:             t('template_contact'),
          aboutMe:             t('template_about_me'),
          summary:             t('template_summary'),
        };
        await exportToDocx(cv, sections, locale, labels);
      }
      toast.success(t('export_success', { format: format.toUpperCase() }));
      track('cv_exported', { format });
    } catch (error) {
      console.error('Export error:', error);
      toast.error(t('export_failed'));
    } finally {
      setExporting(false);
      setExportOpen(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-y-2 border-b border-stone-200 bg-white px-2 py-2 sm:px-4 dark:border-stone-700 dark:bg-stone-900">
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="truncate max-w-[120px] text-sm font-semibold text-stone-900 sm:max-w-[200px] dark:text-white">
          {cv?.title || t('untitled_cv')}
        </h2>
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
                  <span className="min-w-0">
                    {t('export_docx')}
                    <span className="block text-xs text-stone-400">{t('export_docx_hint')}</span>
                  </span>
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
    </div>
  );
}
