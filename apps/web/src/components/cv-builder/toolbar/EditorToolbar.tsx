'use client';

import { useCVStore } from '@/store/cv-store';
import { useTranslations, useLocale } from 'next-intl';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { exportToPDF, exportToDocx, type DocxLabels } from '@/lib/export-cv';
import {
  Undo2,
  Redo2,
  Download,
  Check,
  Loader2,
  FileText,
  FileSpreadsheet,
} from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';
import FontPanel from './FontPanel';
import TemplatePanel from './TemplatePanel';

interface EditorToolbarProps {
  cvId: string;
}

export default function EditorToolbar({ cvId }: EditorToolbarProps) {
  const t = useTranslations('cv_builder');
  const locale = useLocale();
  const { cv, sections, isDirty, isSaving, lastSavedAt, undo, redo, canUndo, canRedo } = useCVStore();
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async (format: 'pdf' | 'docx') => {
    if (!cv) return;
    setExporting(true);
    try {
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
    } catch (error) {
      console.error('Export error:', error);
      toast.error(`Export failed: ${(error as Error).message}`);
    } finally {
      setExporting(false);
      setExportOpen(false);
    }
  };

  return (
    <div className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-2 dark:border-stone-700 dark:bg-stone-900">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-stone-900 dark:text-white truncate max-w-[200px]">
          {cv?.title || 'Untitled CV'}
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

      <div className="flex items-center gap-1">
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
              <div className="absolute end-0 z-20 mt-1 w-44 rounded-lg border border-stone-200 bg-white py-1 shadow-lg dark:border-stone-700 dark:bg-stone-800">
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-stone-600 hover:bg-stone-50 dark:text-stone-400 dark:hover:bg-stone-700"
                  onClick={() => handleExport('pdf')}
                >
                  <FileText className="h-4 w-4 text-red-500" />
                  {t('export_pdf')}
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-stone-600 hover:bg-stone-50 dark:text-stone-400 dark:hover:bg-stone-700"
                  onClick={() => handleExport('docx')}
                >
                  <FileSpreadsheet className="h-4 w-4 text-brand-500" />
                  {t('export_docx')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

    </div>
  );
}
