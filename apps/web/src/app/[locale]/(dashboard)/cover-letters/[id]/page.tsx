'use client';
import React from 'react';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { useAuth } from '@/providers/AuthProvider';
import { api } from '@/lib/api';
import { track } from '@/lib/analytics';
import { useCoverLetterStore } from '@/store/cover-letter-store';
import { CoverLetter, UpdateCoverLetterData, SubscriptionPlan, PLAN_CONFIGS, resolveEffectivePlan } from '@flacroncv/shared-types';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import UpgradeModal from '@/components/shared/UpgradeModal';
import InAppWarning from '@/components/shared/InAppWarning';
import CoverLetterPreview, { COVER_LETTER_TEMPLATES } from '@/components/cover-letter/CoverLetterPreview';
import { ensureDarkSurface, readableOn, INK } from '@/lib/design-tokens';
import { exportCoverLetterToPDF, exportCoverLetterToDocx } from '@/lib/export-cv';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Save,
  Check,
  Loader2,
  ChevronDown,
  FileDown,
  FileText,
  File,
  Sparkles,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo2,
  Redo2,
  LayoutTemplate,
  Lock,
  Pencil,
  Eye,
  AlertTriangle,
  Wand2,
} from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import UnderlineExtension from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';

export default function CoverLetterEditorPage(): React.JSX.Element | null {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const params = useParams();
  const coverLetterId = params.id as string;
  const [exportMenuOpen, setExportMenuOpen]     = useState(false);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<'ai_credits' | 'exports'>('ai_credits');
  const [showAIConfirm, setShowAIConfirm]       = useState(false);
  // A regenerated paragraph awaiting the user's approval. Held on the client
  // only — the document is not touched until "replace" is pressed.
  const [paragraphDraft, setParagraphDraft] =
    useState<{ original: string; suggestion: string } | null>(null);
  // Mobile: preview is hidden by default; this toggles editor <-> preview
  // below the lg breakpoint so small-screen users can see their letter.
  const [mobileView, setMobileView]             = useState<'edit' | 'preview'>('edit');
  const [detailsOpen, setDetailsOpen]           = useState(false);

  const {
    coverLetter,
    isDirty,
    isSaving,
    lastSavedAt,
    setCoverLetter,
    setContent,
    updateField,
    updateStyling,
    setSaving,
    setLastSavedAt,
    reset,
  } = useCoverLetterStore();

  const saveTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const saveErrorToastRef = useRef<string | number | undefined>(undefined);
  // Bumped on each autosave failure to re-arm the save effect (same pattern as CV editor).
  const [retryTick, setRetryTick] = useState(0);
  const detailsAutoOpened = useRef(false);

  // Open "Letter details" once, on first load, when the letter is not addressed
  // to anyone. A collapsed panel is right for a letter that is already filled
  // in, but for a blank one it hides the only place those fields can be set —
  // and an unaddressed letter is the case where the user most needs them.
  useEffect(() => {
    if (!coverLetter || detailsAutoOpened.current) return;
    detailsAutoOpened.current = true;
    if (!coverLetter.recipientName?.trim() && !coverLetter.companyName?.trim()) {
      setDetailsOpen(true);
    }
  }, [coverLetter]);

  // Load cover letter data.
  //
  // refetchOnWindowFocus MUST stay off: it defaults to true and staleTime is 60s
  // (QueryProvider), and this queryFn writes straight into component state via
  // setCoverLetter. Tabbing away for a minute and returning therefore replaced
  // the in-progress draft with the server copy and reset the dirty flag, losing
  // unsaved edits with no warning.
  const { isLoading, isError, refetch } = useQuery({
    queryKey: ['cover-letter', coverLetterId],
    queryFn: async () => {
      const data = await api.get<CoverLetter>(`/cover-letters/${coverLetterId}`);
      setCoverLetter(data);
      return data;
    },
    refetchOnWindowFocus: false,
  });

  // Tiptap editor
  const editor = useEditor({
    extensions: [
      StarterKit,
      UnderlineExtension,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
    ],
    content: coverLetter?.content || '',
    onUpdate: ({ editor: ed }) => {
      setContent(ed.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-sm dark:prose-invert max-w-none min-h-[400px] focus:outline-none p-4',
      },
    },
  });

  // Update editor content when cover letter loads
  useEffect(() => {
    if (editor && coverLetter?.content && !editor.isDestroyed) {
      const currentContent = editor.getHTML();
      if (currentContent !== coverLetter.content) {
        editor.commands.setContent(coverLetter.content);
      }
    }
  }, [editor, coverLetter?.content]);

  // Flush a pending unsaved change on unmount, then clear the store. Reads the
  // latest state directly (safe outside render) so an edit made in the 2s
  // autosave window isn't lost when navigating away.
  useEffect(() => {
    return () => {
      clearTimeout(saveTimerRef.current);
      const { coverLetter: cl, isDirty: dirty } = useCoverLetterStore.getState();
      if (dirty && cl) {
        // Fire-and-forget — the component is unmounting but the request continues.
        api.put(`/cover-letters/${coverLetterId}`, {
          title: cl.title,
          templateId: cl.templateId,
          recipientName: cl.recipientName,
          recipientTitle: cl.recipientTitle,
          companyName: cl.companyName,
          companyAddress: cl.companyAddress,
          jobTitle: cl.jobTitle,
          jobDescription: cl.jobDescription,
          content: cl.content,
          styling: cl.styling,
        }).catch(() => {});
      }
      reset();
    };
  }, [reset, coverLetterId]);

  // Warn before a full-page unload (tab close / hard navigation) with unsaved changes.
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Auto-save with 2-second debounce; after a failure, capped exponential backoff.
  const autoSave = useCallback(async () => {
    if (!coverLetter || !isDirty) return;

    setSaving(true);
    try {
      const updateData: UpdateCoverLetterData = {
        title: coverLetter.title,
        templateId: coverLetter.templateId,
        recipientName: coverLetter.recipientName,
        recipientTitle: coverLetter.recipientTitle,
        companyName: coverLetter.companyName,
        companyAddress: coverLetter.companyAddress,
        jobTitle: coverLetter.jobTitle,
        jobDescription: coverLetter.jobDescription,
        content: coverLetter.content,
        styling: coverLetter.styling,
      };

      await api.put(`/cover-letters/${coverLetterId}`, updateData);
      setLastSavedAt(new Date());

      if (saveErrorToastRef.current !== undefined) {
        toast.dismiss(saveErrorToastRef.current);
        saveErrorToastRef.current = undefined;
      }
      setRetryTick(0);
    } catch (error) {
      console.error('Auto-save failed:', error);

      if (saveErrorToastRef.current === undefined) {
        saveErrorToastRef.current = toast.error(t('coverLetters.autosave_failed'), {
          duration: Infinity,
        });
      }
      // Re-arm the effect: isDirty stays true on failure but neither dep would
      // otherwise change, so without this the "keep retrying" promise is false.
      setRetryTick((n) => n + 1);
    } finally {
      setSaving(false);
    }
  }, [coverLetter, isDirty, coverLetterId, setSaving, setLastSavedAt, t]);

  useEffect(() => {
    if (!isDirty) return;
    clearTimeout(saveTimerRef.current);
    const delay = retryTick === 0 ? 2000 : Math.min(2000 * 2 ** retryTick, 30_000);
    saveTimerRef.current = setTimeout(autoSave, delay);
    return () => clearTimeout(saveTimerRef.current);
  }, [isDirty, autoSave, retryTick]);

  // Manual save
  const handleManualSave = () => {
    clearTimeout(saveTimerRef.current);
    autoSave();
  };

  // Does the letter have content that a regenerate would overwrite?
  const hasExistingContent = () => {
    const html = coverLetter?.content || '';
    return html.replace(/<[^>]*>/g, '').trim().length > 0;
  };

  /** True when the user still has AI credits; opens the paywall when not. */
  const ensureAICredits = (): boolean => {
    const aiCreditsUsed = user?.usage?.aiCreditsUsed || 0;
    const aiCreditsLimit = Math.min(
      user?.usage?.aiCreditsLimit || 5,
      PLAN_CONFIGS[resolveEffectivePlan(user?.subscription)].limits.aiCredits,
    );
    if (aiCreditsUsed >= aiCreditsLimit) {
      setUpgradeReason('ai_credits');
      setShowUpgradeModal(true);
      return false;
    }
    return true;
  };

  // AI improve handler with credit check. Because it REGENERATES (replacing the
  // whole letter), confirm first when there is content to lose.
  const handleAIImprove = () => {
    const aiCreditsUsed = user?.usage?.aiCreditsUsed || 0;
    const aiCreditsLimit = Math.min(
      user?.usage?.aiCreditsLimit || 5,
      PLAN_CONFIGS[resolveEffectivePlan(user?.subscription)].limits.aiCredits,
    );

    if (aiCreditsUsed >= aiCreditsLimit) {
      setUpgradeReason('ai_credits');
      setShowUpgradeModal(true);
      return;
    }

    if (hasExistingContent()) {
      setShowAIConfirm(true);
      return;
    }

    aiMutation.mutate();
  };

  const confirmAIImprove = () => {
    setShowAIConfirm(false);
    aiMutation.mutate();
  };

  const LOCALE_LANGUAGE_NAMES: Record<string, string> = {
    en: 'English', es: 'Spanish', fr: 'French',
    de: 'German',  ar: 'Arabic',  ur: 'Urdu',
  };

  // AI improve mutation
  const aiMutation = useMutation({
    mutationFn: () =>
      api.post<CoverLetter>(`/cover-letters/${coverLetterId}/ai/generate`, {
        jobTitle: coverLetter?.jobTitle || '',
        jobDescription: coverLetter?.jobDescription || '',
        companyName: coverLetter?.companyName || '',
        tone: 'professional',
        language: LOCALE_LANGUAGE_NAMES[locale] || 'English',
      }),
    onSuccess: (data) => {
      setCoverLetter(data);
      if (editor && !editor.isDestroyed) {
        editor.commands.setContent(data.content);
      }
      toast.success(t('coverLetters.ai_improved'));
      refreshUser();
    },
    onError: (error: Error) => {
      refreshUser();
      toast.error(error.message, { description: t('common.generate_failed_no_charge') });
    },
  });

  /**
   * Rewrite ONE paragraph. The whole letter goes along as context so the
   * replacement keeps the surrounding voice and language, but only the single
   * paragraph comes back — and only after the user approves it does anything
   * change in the document.
   */
  const paragraphMutation = useMutation({
    mutationFn: (vars: { letter: string; paragraph: string }) =>
      api.post<{ content: string }>('/ai/regenerate-paragraph', {
        letter: vars.letter,
        paragraph: vars.paragraph,
        language: LOCALE_LANGUAGE_NAMES[locale] || 'English',
      }),
    onSuccess: (data, vars) => {
      setParagraphDraft({ original: vars.paragraph, suggestion: data.content.trim() });
      track('ai_generation', { feature: 'regenerate-paragraph' });
      refreshUser();
    },
    onError: (error: Error) => {
      // A failed generation refunds its credit server-side; re-read the balance.
      refreshUser();
      toast.error(error.message, { description: t('common.generate_failed_no_charge') });
    },
  });

  const handleRegenerateParagraph = () => {
    if (!editor || editor.isDestroyed || paragraphMutation.isPending) return;

    const paragraph = currentParagraphText(editor);
    if (!paragraph) {
      toast.error(t('coverLetters.regenerate_paragraph_none'));
      return;
    }
    if (!ensureAICredits()) return;

    paragraphMutation.mutate({
      letter: editor.getText({ blockSeparator: '\n\n' }).slice(0, 20000),
      paragraph: paragraph.slice(0, 4000),
    });
  };

  /** Swap the approved text in, leaving every other paragraph untouched. */
  const applyParagraphDraft = () => {
    if (!editor || editor.isDestroyed || !paragraphDraft) return;

    const replacement = paragraphDraft.suggestion.trim();
    if (!replacement) return;

    // Re-locate by text rather than by a stored position: the user may have
    // typed elsewhere while the model was working, which shifts offsets.
    const range = findParagraphRange(editor, paragraphDraft.original);
    if (!range) {
      toast.error(t('coverLetters.regenerate_not_found'));
      setParagraphDraft(null);
      return;
    }

    const nodes = replacement
      .split(/\n\s*\n/)
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] }));

    editor.chain().focus().insertContentAt(range, nodes).run();
    setParagraphDraft(null);
    toast.success(t('coverLetters.regenerate_replaced'));
  };

  // Export handlers — capture the live preview as an image (PDF and DOCX identical)
  const handleExport = async (format: 'pdf' | 'docx') => {
    setExportMenuOpen(false);
    if (!coverLetter) return;
    let reservationId: string | undefined;
    try {
      // Reserve first; confirm after a successful file, refund if render fails.
      const decision = await api.post<{
        allowed: boolean;
        reason?: string;
        reservationId?: string;
      }>('/exports/record', {
        format,
        type: 'cover_letter',
        documentId: coverLetter.id,
      });
      if (!decision.allowed) {
        setUpgradeReason('exports');
        setShowUpgradeModal(true);
        return;
      }
      reservationId = decision.reservationId;
      if (format === 'pdf') {
        await exportCoverLetterToPDF(coverLetter.title);
      } else {
        await exportCoverLetterToDocx(coverLetter);
      }
      if (reservationId) {
        await api.post('/exports/confirm', {
          reservationId,
          format,
          type: 'cover_letter',
          documentId: coverLetter.id,
        });
      }
      toast.success(t('coverLetters.exported', { format: format.toUpperCase() }));
    } catch {
      if (reservationId) {
        try {
          await api.post('/exports/refund', { reservationId });
        } catch {
          /* refund best-effort */
        }
      }
      toast.error(t('coverLetters.export_failed'));
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center" role="status" aria-label={t('common.loading')}>
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  // A failed fetch is recoverable — offer retry/back instead of a dead-end message.
  if (isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-white">{t('coverLetters.load_error_title')}</h2>
          <p className="mt-1 max-w-sm text-sm text-stone-600 dark:text-stone-400">{t('coverLetters.load_error_desc')}</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => refetch()}>{t('coverLetters.retry')}</Button>
          <Link href="/cover-letters">
            <Button variant="secondary">{t('coverLetters.back_to_list')}</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!coverLetter) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-stone-500">{t('coverLetters.not_found')}</p>
      </div>
    );
  }

  // Summary shown on the collapsed "Letter details" row, so the user can tell
  // at a glance whether the letter is actually addressed to anyone without
  // opening the panel or scanning the preview.
  const addressedTo = [coverLetter.recipientName, coverLetter.companyName]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col -m-4 sm:-m-6 lg:-m-8">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-2 dark:border-stone-700 dark:bg-stone-900">
        <div className="flex items-center gap-3">
          <Link href="/cover-letters">
            <button
              className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
              aria-label={t('coverLetters.back_to_list')}
            >
              <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
            </button>
          </Link>
          <input
            type="text"
            value={coverLetter.title}
            onChange={(e) => updateField('title', e.target.value)}
            className="border-none bg-transparent text-lg font-semibold text-stone-900 outline-none focus:ring-0 dark:text-white"
            placeholder={t('coverLetters.untitled')}
            aria-label={t('coverLetters.title_label')}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Save status */}
          <span className="flex items-center gap-1.5 text-xs text-stone-400">
            {isSaving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('coverLetters.saving')}
              </>
            ) : isDirty ? (
              <>
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                {t('coverLetters.unsaved')}
              </>
            ) : lastSavedAt ? (
              <>
                <Check className="h-3 w-3 text-emerald-500" />
                {t('coverLetters.saved_at', { time: formatDate(lastSavedAt) })}
              </>
            ) : null}
          </span>

          {/* Manual save */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleManualSave}
            disabled={!isDirty || isSaving}
            icon={<Save className="h-4 w-4" />}
          >
            {t('common.save')}
          </Button>

          {/* AI Improve */}
          <Button
            variant="outline"
            size="sm"
            loading={aiMutation.isPending}
            onClick={handleAIImprove}
            icon={<Sparkles className="h-4 w-4" />}
          >
            {t('coverLetters.ai_improve')}
          </Button>

          {/* Template picker */}
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setTemplateMenuOpen(!templateMenuOpen); setExportMenuOpen(false); }}
              icon={<LayoutTemplate className="h-4 w-4" />}
              aria-haspopup="true"
              aria-expanded={templateMenuOpen}
            >
              {t('coverLetters.template_label')}
              <ChevronDown className="h-3 w-3" />
            </Button>
            {templateMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setTemplateMenuOpen(false)} />
                <div className="absolute end-0 z-20 mt-1 w-72 rounded-xl border border-stone-200 bg-white p-3 shadow-xl dark:border-stone-700 dark:bg-stone-800">
                  <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-stone-400">{t('coverLetters.choose_template')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {COVER_LETTER_TEMPLATES.map((tmpl) => {
                      const isActive = (coverLetter.templateId || 'modern') === tmpl.id;
                      const userPlan = resolveEffectivePlan(user?.subscription);
                      const planOrder = [SubscriptionPlan.FREE, SubscriptionPlan.PRO, SubscriptionPlan.ENTERPRISE];
                      const locked = planOrder.indexOf(userPlan as SubscriptionPlan) < planOrder.indexOf(tmpl.tier);
                      return (
                        <button
                          key={tmpl.id}
                          type="button"
                          onClick={() => {
                            if (locked) {
                              setTemplateMenuOpen(false);
                              router.push('/settings/billing');
                              return;
                            }
                            updateField('templateId', tmpl.id);
                            // Only adopt the new template's colour when the
                            // current one is still a factory default. Resetting
                            // unconditionally meant that trying on a template to
                            // see how it looked silently discarded a colour the
                            // user had picked, with no undo.
                            if (isFactoryColor(coverLetter.styling.primaryColor)) {
                              updateStyling('primaryColor', tmpl.defaultColor);
                            }
                            setTemplateMenuOpen(false);
                          }}
                          className={cn(
                            'relative rounded-lg border-2 p-2.5 text-start transition-all',
                            isActive
                              ? 'border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-950'
                              : locked
                                ? 'border-stone-200 opacity-60 dark:border-stone-700'
                                : 'border-stone-200 hover:border-stone-300 dark:border-stone-700 dark:hover:border-stone-600',
                          )}
                        >
                          {/* Mini thumbnail */}
                          <div className="mb-1.5 h-10 overflow-hidden rounded" style={{ background: '#f8f8f8' }}>
                            {/* The active card previews the accent actually in
                                use; the others show their own default, which is
                                what picking them would apply. Previously every
                                card showed its factory colour, so the selected
                                one contradicted the letter beside it. */}
                            <CLThumbnail
                              templateId={tmpl.id}
                              color={isActive ? (coverLetter.styling.primaryColor || tmpl.defaultColor) : tmpl.defaultColor}
                              rtl={locale === 'ar' || locale === 'ur'}
                            />
                          </div>
                          <div className="text-xs font-semibold text-stone-800 dark:text-stone-200">{t(`coverLetters.${tmpl.nameKey}`)}</div>
                          <div className="text-[10px] text-stone-400">{t(`coverLetters.${tmpl.descKey}`)}</div>
                          {locked && (
                            <div className="absolute end-1.5 top-1.5 rounded-full bg-stone-700/80 p-0.5">
                              <Lock className="h-2.5 w-2.5 text-white" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {/* Color picker */}
                  <div className="mt-3 border-t border-stone-100 pt-3 dark:border-stone-700">
                    <p className="mb-1.5 text-xs font-medium text-stone-500">{t('coverLetters.accent_color')}</p>
                    <div className="flex items-center gap-2">
                      {['#2563eb','#0f766e','#7c3aed','#dc2626','#1e3a5f','#374151','#c2410c','#0c4a6e'].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => updateStyling('primaryColor', c)}
                          aria-label={`${t('coverLetters.accent_color')} ${c}`}
                          className={cn('h-5 w-5 rounded-full border-2 transition-transform hover:scale-110', coverLetter.styling.primaryColor === c ? 'border-stone-900 dark:border-white scale-110' : 'border-transparent')}
                          style={{ background: c }}
                        />
                      ))}
                      <input
                        type="color"
                        value={coverLetter.styling.primaryColor || '#2563eb'}
                        onChange={(e) => updateStyling('primaryColor', e.target.value)}
                        className="h-5 w-5 cursor-pointer rounded-full border-0 bg-transparent p-0"
                        title={t('coverLetters.custom_color')}
                        aria-label={t('coverLetters.custom_color')}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Export dropdown */}
          <div className="relative">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setExportMenuOpen(!exportMenuOpen); setTemplateMenuOpen(false); }}
              icon={<FileDown className="h-4 w-4" />}
              aria-haspopup="true"
              aria-expanded={exportMenuOpen}
            >
              {t('coverLetters.export')}
              <ChevronDown className="h-3 w-3" />
            </Button>
            {exportMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setExportMenuOpen(false)}
                />
                <div className="absolute end-0 z-20 mt-1 w-72 rounded-lg border border-stone-200 bg-white py-1 shadow-lg dark:border-stone-700 dark:bg-stone-800">
                  <div className="px-2 pt-2 pb-1">
                    <InAppWarning>
                      <strong className="block">{t('in_app_warnings.export_title')}</strong>
                      {t('in_app_warnings.export_body')}
                    </InAppWarning>
                  </div>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-stone-600 hover:bg-stone-50 dark:text-stone-400 dark:hover:bg-stone-700"
                    onClick={() => handleExport('pdf')}
                  >
                    <File className="h-4 w-4 text-red-500" />
                    {t('coverLetters.export_pdf')}
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-stone-600 hover:bg-stone-50 dark:text-stone-400 dark:hover:bg-stone-700"
                    onClick={() => handleExport('docx')}
                  >
                    <FileText className="h-4 w-4 text-brand-500" />
                    {t('coverLetters.export_docx')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="border-b border-stone-200 bg-white px-4 py-2 dark:border-stone-700 dark:bg-stone-900">
        <InAppWarning>{t('in_app_warnings.cover_letter')}</InAppWarning>
      </div>

      {/* Mobile edit/preview switch — hidden on lg where both panels show */}
      <div className="flex border-b border-stone-200 bg-white p-1.5 dark:border-stone-700 dark:bg-stone-900 lg:hidden">
        <div className="mx-auto inline-flex rounded-lg bg-stone-100 p-1 dark:bg-stone-800" role="tablist" aria-label={t('coverLetters.view_switch_label')}>
          <button
            role="tab"
            aria-selected={mobileView === 'edit'}
            onClick={() => setMobileView('edit')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              mobileView === 'edit' ? 'bg-white text-brand-700 shadow-sm dark:bg-stone-700 dark:text-brand-300' : 'text-stone-600 dark:text-stone-400',
            )}
          >
            <Pencil className="h-4 w-4" /> {t('coverLetters.edit_tab')}
          </button>
          <button
            role="tab"
            aria-selected={mobileView === 'preview'}
            onClick={() => setMobileView('preview')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              mobileView === 'preview' ? 'bg-white text-brand-700 shadow-sm dark:bg-stone-700 dark:text-brand-300' : 'text-stone-600 dark:text-stone-400',
            )}
          >
            <Eye className="h-4 w-4" /> {t('coverLetters.preview_tab')}
          </button>
        </div>
      </div>

      {/* Split view */}
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Editor panel */}
        <div className={cn(
          'w-full flex-col overflow-hidden border-e border-stone-200 dark:border-stone-700 lg:flex lg:w-1/2',
          mobileView === 'edit' ? 'flex' : 'hidden',
        )}>
          {/* Formatting toolbar */}
          {editor && (
            <div className="flex flex-wrap items-center gap-0.5 border-b border-stone-200 bg-stone-50 px-2 py-1 dark:border-stone-700 dark:bg-stone-800">
              <ToolbarButton
                active={editor.isActive('bold')}
                onClick={() => editor.chain().focus().toggleBold().run()}
                title={t('coverLetters.tb_bold')}
              >
                <Bold className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                active={editor.isActive('italic')}
                onClick={() => editor.chain().focus().toggleItalic().run()}
                title={t('coverLetters.tb_italic')}
              >
                <Italic className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                active={editor.isActive('underline')}
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                title={t('coverLetters.tb_underline')}
              >
                <Underline className="h-4 w-4" />
              </ToolbarButton>

              <div className="mx-1 h-5 w-px bg-stone-300 dark:bg-stone-600" />

              <ToolbarButton
                active={editor.isActive('bulletList')}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                title={t('coverLetters.tb_bullet_list')}
              >
                <List className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                active={editor.isActive('orderedList')}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                title={t('coverLetters.tb_ordered_list')}
              >
                <ListOrdered className="h-4 w-4" />
              </ToolbarButton>

              <div className="mx-1 h-5 w-px bg-stone-300 dark:bg-stone-600" />

              <ToolbarButton
                active={editor.isActive({ textAlign: 'left' })}
                onClick={() => editor.chain().focus().setTextAlign('left').run()}
                title={t('coverLetters.tb_align_left')}
              >
                <AlignLeft className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                active={editor.isActive({ textAlign: 'center' })}
                onClick={() => editor.chain().focus().setTextAlign('center').run()}
                title={t('coverLetters.tb_align_center')}
              >
                <AlignCenter className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                active={editor.isActive({ textAlign: 'right' })}
                onClick={() => editor.chain().focus().setTextAlign('right').run()}
                title={t('coverLetters.tb_align_right')}
              >
                <AlignRight className="h-4 w-4" />
              </ToolbarButton>

              <div className="mx-1 h-5 w-px bg-stone-300 dark:bg-stone-600" />

              <ToolbarButton
                onClick={() => editor.chain().focus().undo().run()}
                disabled={!editor.can().undo()}
                title={t('coverLetters.tb_undo')}
              >
                <Undo2 className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().redo().run()}
                disabled={!editor.can().redo()}
                title={t('coverLetters.tb_redo')}
              >
                <Redo2 className="h-4 w-4" />
              </ToolbarButton>

              <div className="mx-1 h-5 w-px bg-stone-300 dark:bg-stone-600" />

              {/* Font Family Selector */}
              <select
                value={coverLetter.styling?.fontFamily || 'Inter'}
                onChange={(e) => updateStyling('fontFamily', e.target.value)}
                className="text-xs rounded px-2 py-1 bg-white dark:bg-stone-700 border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300"
                title={t('coverLetters.tb_font_family')}
              >
                <option value="Inter">Inter</option>
                <option value="Arial">Arial</option>
                <option value="Georgia">Georgia</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Calibri">Calibri</option>
                <option value="Helvetica">Helvetica</option>
                <option value="Verdana">Verdana</option>
              </select>

              {/* Font Size Selector */}
              <select
                value={coverLetter.styling?.fontSize || '16px'}
                onChange={(e) => updateStyling('fontSize', e.target.value)}
                className="text-xs rounded px-2 py-1 bg-white dark:bg-stone-700 border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300"
                title={t('coverLetters.tb_font_size')}
              >
                <option value="12px">12px</option>
                <option value="14px">14px</option>
                <option value="16px">16px</option>
                <option value="18px">18px</option>
                <option value="20px">20px</option>
              </select>

              <div className="mx-1 h-5 w-px bg-stone-300 dark:bg-stone-600" />

              {/* Rewrite just the paragraph the cursor is in */}
              <button
                type="button"
                onClick={handleRegenerateParagraph}
                disabled={paragraphMutation.isPending}
                title={t('coverLetters.regenerate_paragraph_hint')}
                className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-brand-400 dark:hover:bg-brand-900/20"
              >
                {paragraphMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5" />
                )}
                {t('coverLetters.regenerate_paragraph')}
              </button>
            </div>
          )}

          {/* Sender fields */}
          <div className="flex gap-2 border-b border-stone-200 bg-stone-50 px-3 py-2 dark:border-stone-700 dark:bg-stone-800">
            <input
              type="text"
              value={coverLetter.styling.senderName || ''}
              onChange={(e) => updateStyling('senderName', e.target.value)}
              placeholder={t('coverLetters.ph_sender_name')}
              aria-label={t('coverLetters.ph_sender_name')}
              className="flex-1 rounded border border-stone-200 bg-white px-2 py-1 text-sm text-stone-800 outline-none focus:border-brand-400 dark:border-stone-600 dark:bg-stone-700 dark:text-white"
            />
            <input
              type="email"
              value={coverLetter.styling.senderEmail || ''}
              onChange={(e) => updateStyling('senderEmail', e.target.value)}
              placeholder={t('coverLetters.ph_sender_email')}
              aria-label={t('coverLetters.ph_sender_email')}
              className="flex-1 rounded border border-stone-200 bg-white px-2 py-1 text-sm text-stone-800 outline-none focus:border-brand-400 dark:border-stone-600 dark:bg-stone-700 dark:text-white"
            />
          </div>

          {/* Letter details — who the letter is addressed to.
              Every template draws an inside address from these five fields, but
              until now only the create form could set any of them and nothing
              could set recipientTitle or companyAddress at all. A typo in the
              company name meant abandoning the letter and starting over.
              Collapsed by default with a summary line, so it stays discoverable
              without permanently costing the editor 140px of height. */}
          <div className="border-b border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800">
            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              aria-expanded={detailsOpen}
              className="flex w-full items-center gap-2 px-3 py-2 text-start text-xs text-stone-500 transition-colors hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-700/50"
            >
              <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', !detailsOpen && 'rtl:rotate-90 -rotate-90')} />
              <span className="font-medium text-stone-600 dark:text-stone-300">{t('coverLetters.letter_details')}</span>
              <span className="min-w-0 flex-1 truncate text-stone-400 dark:text-stone-500">
                {addressedTo || t('coverLetters.not_addressed')}
              </span>
            </button>

            {detailsOpen && (
              <div className="px-3 pb-3">
                <p className="mb-2 text-[11px] text-stone-400 dark:text-stone-500">
                  {t('coverLetters.letter_details_hint')}
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {([
                    ['recipientName',   'ph_recipient_name'],
                    ['recipientTitle',  'ph_recipient_title'],
                    ['companyName',     'ph_company_name'],
                    ['jobTitle',        'ph_job_title_applied'],
                  ] as const).map(([field, key]) => (
                    <input
                      key={field}
                      type="text"
                      value={coverLetter[field] || ''}
                      onChange={(e) => updateField(field, e.target.value)}
                      placeholder={t(`coverLetters.${key}`)}
                      aria-label={t(`coverLetters.${key}`)}
                      className="rounded border border-stone-200 bg-white px-2 py-1 text-sm text-stone-800 outline-none focus:border-brand-400 dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                    />
                  ))}
                  <input
                    type="text"
                    value={coverLetter.companyAddress || ''}
                    onChange={(e) => updateField('companyAddress', e.target.value)}
                    placeholder={t('coverLetters.ph_company_address')}
                    aria-label={t('coverLetters.ph_company_address')}
                    className="rounded border border-stone-200 bg-white px-2 py-1 text-sm text-stone-800 outline-none focus:border-brand-400 dark:border-stone-600 dark:bg-stone-700 dark:text-white sm:col-span-2"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Editor content */}
          <div className="flex-1 overflow-y-auto bg-white dark:bg-stone-900">
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* Preview panel */}
        <div className={cn(
          'w-full overflow-y-auto bg-stone-100 p-6 dark:bg-stone-800 lg:block lg:w-1/2',
          mobileView === 'preview' ? 'block' : 'hidden',
        )}>
          <div className="mx-auto max-w-[794px] rounded-lg shadow-md overflow-hidden">
            <CoverLetterPreview
              coverLetter={coverLetter}
              senderName={coverLetter.styling.senderName || undefined}
              senderEmail={coverLetter.styling.senderEmail || undefined}
            />
          </div>
        </div>
      </div>

      {/* Confirm before AI regenerates over existing content */}
      <Modal
        isOpen={showAIConfirm}
        onClose={() => setShowAIConfirm(false)}
        title={t('coverLetters.ai_improve_confirm_title')}
        size="sm"
      >
        <div className="flex gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            {t('coverLetters.ai_improve_confirm_body')}
          </p>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setShowAIConfirm(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={confirmAIImprove} icon={<Sparkles className="h-4 w-4" />}>
            {t('coverLetters.ai_improve_confirm_cta')}
          </Button>
        </div>
      </Modal>

      {/* Review the regenerated paragraph before it replaces anything */}
      <Modal
        isOpen={!!paragraphDraft}
        onClose={() => setParagraphDraft(null)}
        title={t('coverLetters.regenerate_paragraph_title')}
        size="xl"
      >
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-stone-400">
              {t('coverLetters.regenerate_original')}
            </p>
            <p className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-stone-50 p-3 text-sm text-stone-600 dark:bg-stone-800 dark:text-stone-400">
              {paragraphDraft?.original}
            </p>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="paragraphSuggestion"
              className="block text-xs font-semibold uppercase tracking-wider text-stone-400"
            >
              {t('coverLetters.regenerate_new')}
            </label>
            <textarea
              id="paragraphSuggestion"
              value={paragraphDraft?.suggestion ?? ''}
              onChange={(e) =>
                setParagraphDraft((d) => (d ? { ...d, suggestion: e.target.value } : d))
              }
              rows={8}
              className="input-field resize-y"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setParagraphDraft(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={applyParagraphDraft}
            disabled={!paragraphDraft?.suggestion.trim()}
            icon={<Check className="h-4 w-4" />}
          >
            {t('coverLetters.regenerate_apply')}
          </Button>
        </div>
      </Modal>

      {/* Upgrade Modal */}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        reason={upgradeReason}
      />
    </div>
  );
}

/**
 * Plain text of the top-level block the cursor sits in, or '' when the cursor
 * is not inside a non-empty paragraph.
 */
function currentParagraphText(editor: Editor): string {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === 'paragraph') return node.textContent.trim();
  }
  return '';
}

/** Document range of the first paragraph whose text matches, or null. */
function findParagraphRange(editor: Editor, text: string): { from: number; to: number } | null {
  const needle = text.trim();
  if (!needle) return null;

  let found: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name === 'paragraph' && node.textContent.trim() === needle) {
      found = { from: pos, to: pos + node.nodeSize };
      return false;
    }
    return true;
  });
  return found;
}

/**
 * True when the accent is still one of the six templates' factory colours —
 * i.e. the user has never chosen one themselves, so switching template may
 * safely adopt the new template's default.
 */
function isFactoryColor(color?: string | null): boolean {
  const c = (color || '').trim().toLowerCase();
  if (!c) return true;
  return COVER_LETTER_TEMPLATES.some((t) => t.defaultColor.toLowerCase() === c);
}

/**
 * Mini thumbnail for the template picker.
 *
 * Colours are derived exactly as the real templates derive them: `band` for
 * surfaces that carry white marks, `ink` for anything standing in for text on
 * white. Painting the raw accent here would show a legible preview of an
 * illegible letter — the same divergence the CV picker had.
 */
function CLThumbnail({ templateId, color, rtl }: { templateId: string; color: string; rtl?: boolean }) {
  const c = readableOn(color, '#ffffff', 4.5);   // stands in for accent text
  const band = ensureDarkSurface(color, 5);      // surfaces carrying white marks
  const rule = color;                            // decorative rules, as chosen
  const head = INK.heading;                      // the sender's name
  const meta = INK.meta;                         // dates, secondary lines
  const body = '#dcdfe4';                        // body copy
  // Every template now mirrors under dir=rtl (Executive's header moved from a
  // physical 'right' to a logical 'end'), so the whole card can mirror with a
  // single transform rather than six sets of hand-flipped coordinates.
  const g = rtl ? 'translate(120,0) scale(-1,1)' : undefined;
  const Frame = ({ children }: { children: React.ReactNode }) => (
    <svg viewBox="0 0 120 48" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="120" height="48" fill="#fff"/>
      <g transform={g}>{children}</g>
    </svg>
  );

  if (templateId === 'classic') return (
    <Frame>
      <rect x="8" y="6" width="60" height="3" rx="1" fill={head}/>
      <rect x="8" y="11" width="40" height="2" rx="1" fill={meta}/>
      <rect x="8" y="16" width="104" height="1.5" fill={rule}/>
      <rect x="8" y="21" width="80" height="2" rx="1" fill={body}/>
      <rect x="8" y="25" width="104" height="2" rx="1" fill={body}/>
      <rect x="8" y="29" width="90" height="2" rx="1" fill={body}/>
      <rect x="8" y="33" width="70" height="2" rx="1" fill={body}/>
    </Frame>
  );
  if (templateId === 'modern') return (
    <Frame>
      <rect width="120" height="14" fill={band}/>
      <rect x="8" y="3" width="50" height="4" rx="1" fill="#fff"/>
      <rect x="8" y="9" width="30" height="2" rx="1" fill="#fff" opacity="0.75"/>
      <rect x="8" y="18" width="80" height="2" rx="1" fill={body}/>
      <rect x="8" y="22" width="104" height="2" rx="1" fill={body}/>
      <rect x="8" y="26" width="90" height="2" rx="1" fill={body}/>
      <rect x="8" y="30" width="70" height="2" rx="1" fill={body}/>
      <rect x="8" y="36" width="40" height="2" rx="1" fill={c}/>
    </Frame>
  );
  if (templateId === 'minimalist') return (
    <Frame>
      <rect x="8" y="6" width="35" height="2" rx="1" fill={c}/>
      <rect x="8" y="14" width="104" height="2" rx="1" fill={body}/>
      <rect x="8" y="19" width="80" height="2" rx="1" fill={body}/>
      <rect x="8" y="24" width="104" height="2" rx="1" fill={body}/>
      <rect x="8" y="29" width="60" height="2" rx="1" fill={body}/>
      <rect x="8" y="36" width="30" height="2" rx="1" fill={meta}/>
    </Frame>
  );
  if (templateId === 'creative') return (
    <Frame>
      <rect width="5" height="48" fill={rule}/>
      <rect x="12" y="6" width="50" height="4" rx="1" fill={c}/>
      <rect x="12" y="12" width="30" height="2" rx="1" fill={meta}/>
      <rect x="12" y="18" width="100" height="2" rx="1" fill={body}/>
      <rect x="12" y="23" width="90" height="2" rx="1" fill={body}/>
      <rect x="12" y="28" width="100" height="2" rx="1" fill={body}/>
      <rect x="12" y="33" width="55" height="2" rx="1" fill={body}/>
    </Frame>
  );
  if (templateId === 'corporate') return (
    <Frame>
      <rect width="120" height="4" fill={rule}/>
      <rect x="8" y="8" width="55" height="3" rx="1" fill={c}/>
      <rect x="8" y="13" width="35" height="2" rx="1" fill={meta}/>
      <rect x="8" y="17" width="104" height="1" fill={INK.hair}/>
      <rect x="8" y="21" width="80" height="2" rx="1" fill={body}/>
      <rect x="8" y="25" width="104" height="2" rx="1" fill={body}/>
      <rect x="8" y="29" width="90" height="2" rx="1" fill={body}/>
      <rect x="8" y="36" width="40" height="2" rx="1" fill={meta}/>
    </Frame>
  );
  // executive
  return (
    <Frame>
      <rect x="50" y="6" width="62" height="3" rx="1" fill={head}/>
      <rect x="70" y="11" width="42" height="2" rx="1" fill={meta}/>
      <rect x="8" y="16" width="104" height="2" rx="1" fill={rule}/>
      <rect x="8" y="22" width="80" height="2" rx="1" fill={body}/>
      <rect x="8" y="26" width="104" height="2" rx="1" fill={body}/>
      <rect x="8" y="30" width="70" height="2" rx="1" fill={body}/>
      <rect x="8" y="38" width="40" height="2" rx="1" fill={meta}/>
    </Frame>
  );
}

function ToolbarButton({
  children,
  active,
  disabled,
  onClick,
  title,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`rounded p-1.5 transition-colors ${
        active
          ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400'
          : 'text-stone-500 hover:bg-stone-200 dark:text-stone-400 dark:hover:bg-stone-700'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

