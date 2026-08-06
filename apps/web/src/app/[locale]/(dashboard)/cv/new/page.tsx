'use client';
import React from 'react';

import { useState, useEffect, useId } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/providers/AuthProvider';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { ArrowRight, Upload, FileText, LayoutTemplate, CheckCircle2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { CV_NEW_DRAFT_KEY as DRAFT_KEY } from './constants';
import ImportResumeModal from '@/components/cv-builder/ImportResumeModal';

/** How the user wants to begin. Drives the CTA and the supporting copy below. */
type StartMode = 'scratch' | 'import' | 'template';

export default function NewCVPage(): React.JSX.Element | null {
  const t = useTranslations();
  const tCv = useTranslations('cv_builder');
  const tCommon = useTranslations('common');
  const tImport = useTranslations('resume_import');
  const tTpl = useTranslations('template_picker');
  const router = useRouter();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<StartMode>('scratch');
  const [showImport, setShowImport] = useState(false);
  const groupId = useId();

  // Restore draft title from sessionStorage on first mount
  useEffect(() => {
    const saved = sessionStorage.getItem(DRAFT_KEY);
    if (saved) {
      try {
        const { title: savedTitle } = JSON.parse(saved) as { title: string };
        if (savedTitle) setTitle(savedTitle);
      } catch {
        sessionStorage.removeItem(DRAFT_KEY);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist title to sessionStorage
  useEffect(() => {
    if (title) {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ title }));
    }
  }, [title]);

  const handleCancel = () => {
    sessionStorage.removeItem(DRAFT_KEY);
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/dashboard');
    }
  };

  /** Step 2 reads the title back out of sessionStorage, so it must be set first. */
  const goToTemplatePicker = (cvTitle: string) => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ title: cvTitle }));
    router.push('/cv/new/pick-template');
  };

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === 'import') {
      setShowImport(true);
      return;
    }

    if (mode === 'template') {
      // Straight to the gallery. The picker still needs a name, so an untouched
      // field falls back to the default the hint under the field spells out.
      goToTemplatePicker(title.trim() || tCv('untitled_cv'));
      return;
    }

    if (!title.trim()) {
      toast.error(tCv('new_title_required'));
      return;
    }
    goToTemplatePicker(title.trim());
  };

  const options: {
    value: StartMode;
    label: string;
    description: string;
    icon: React.ReactNode;
  }[] = [
    {
      value: 'scratch',
      label: tCv('new_option_scratch'),
      description: tCv('new_option_scratch_desc'),
      icon: <FileText className="h-5 w-5" />,
    },
    {
      value: 'import',
      label: tImport('title'),
      description: tImport('subtitle'),
      icon: <Upload className="h-5 w-5" />,
    },
    {
      value: 'template',
      label: tTpl('title'),
      description: tCv('new_option_template_desc'),
      icon: <LayoutTemplate className="h-5 w-5" />,
    },
  ];

  // What the import modal really does — every value below is read from the code
  // behind it (src/lib/extractResumeText.ts), not promised on its behalf.
  const importFacts = [
    tImport('upload_hint'),
    tImport('card_progress', { label: tImport('extracting') }),
    tImport('card_errors'),
    tImport('card_privacy'),
  ];

  const titleHint =
    mode === 'scratch'
      ? tCv('new_title_hint')
      : mode === 'import'
        ? tCv('new_title_import_hint')
        : tCv('new_title_optional_hint', { name: tCv('untitled_cv') });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Step indicator — importing skips the template step, so it is hidden there */}
      {mode !== 'import' && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
              1
            </span>
            <span className="text-sm font-semibold text-stone-900 dark:text-white">{tCv('new_step_details')}</span>
          </div>
          <div className="h-px flex-1 bg-stone-200 dark:bg-stone-700" />
          <div className="flex items-center gap-2 opacity-40">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-stone-300 text-sm font-bold text-stone-400 dark:border-stone-600 dark:text-stone-500">
              2
            </span>
            <span className="text-sm font-medium text-stone-400 dark:text-stone-500">{tCv('new_step_template')}</span>
          </div>
        </div>
      )}

      <h1 className="text-2xl font-bold text-stone-900 dark:text-white">
        {t('dashboard.create_cv')}
      </h1>

      <form onSubmit={handleContinue} className="space-y-6">
        {/* Three starting points. Native radios keep arrow-key navigation,
            label association and form semantics for free. */}
        <fieldset>
          <legend className="mb-3 text-sm font-semibold text-stone-900 dark:text-white">
            {tCv('new_how_label')}
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {options.map((opt) => {
              const optionId = `${groupId}-${opt.value}`;
              const selected = mode === opt.value;
              return (
                <div key={opt.value} className="relative">
                  <input
                    type="radio"
                    id={optionId}
                    name={`${groupId}-start-mode`}
                    value={opt.value}
                    checked={selected}
                    onChange={() => setMode(opt.value)}
                    className="peer sr-only"
                    data-testid={`start-option-${opt.value}`}
                  />
                  <label
                    htmlFor={optionId}
                    className={cn(
                      'flex h-full cursor-pointer flex-col gap-2 rounded-xl border-2 p-4 text-start transition-all',
                      'hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md',
                      'peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-focus-visible:ring-offset-2 dark:peer-focus-visible:ring-offset-stone-950',
                      selected
                        ? 'border-brand-600 bg-brand-50/60 shadow-md dark:border-brand-500 dark:bg-brand-950/30'
                        : 'border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                          selected
                            ? 'bg-brand-600 text-white'
                            : 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
                        )}
                      >
                        {opt.icon}
                      </span>
                      {/* Selection is marked by a badge + icon, not colour alone */}
                      {selected && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          {tCv('new_selected')}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-stone-900 dark:text-white">
                      {opt.label}
                    </span>
                    <span className="text-xs leading-relaxed text-stone-500 dark:text-stone-400">
                      {opt.description}
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
        </fieldset>

        <Card>
          <div className="space-y-5">
            <Input
              id="title"
              label={tCv('new_title_label')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={tCv('new_title_ph')}
              required={mode === 'scratch'}
              hint={titleHint}
              data-testid="cv-title-input"
            />

            {mode === 'import' && (
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-stone-700 dark:bg-stone-800/50">
                <h2 className="text-sm font-semibold text-stone-900 dark:text-white">
                  {tImport('what_to_expect')}
                </h2>
                <ul className="mt-2 space-y-2 text-xs leading-relaxed text-stone-600 dark:text-stone-400">
                  {importFacts.map((fact) => (
                    <li key={fact} className="flex gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden="true" />
                      <span>{fact}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            type="button"
            onClick={handleCancel}
            data-testid="cancel-btn"
          >
            {tCommon('cancel')}
          </Button>
          <Button
            type="submit"
            icon={
              mode === 'import' ? (
                <Upload className="h-4 w-4" />
              ) : (
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              )
            }
            data-testid="continue-btn"
          >
            {mode === 'import' ? tImport('open_button') : tCv('new_continue')}
          </Button>
        </div>
      </form>

      <ImportResumeModal open={showImport} onClose={() => setShowImport(false)} title={title} />
    </div>
  );
}
