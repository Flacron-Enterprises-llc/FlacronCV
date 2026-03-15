'use client';
import React from 'react';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useAuth } from '@/providers/AuthProvider';
import { api } from '@/lib/api';
import { useCoverLetterStore } from '@/store/cover-letter-store';
import { CoverLetter, UpdateCoverLetterData } from '@flacroncv/shared-types';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import UpgradeModal from '@/components/shared/UpgradeModal';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
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
} from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import UnderlineExtension from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';

export default function CoverLetterEditorPage(): React.JSX.Element {
  const t = useTranslations();
  const { user } = useAuth();
  const params = useParams();
  const coverLetterId = params.id as string;
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

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

  const saveTimerRef = useRef<NodeJS.Timeout>();

  // Load cover letter data
  const { isLoading } = useQuery({
    queryKey: ['cover-letter', coverLetterId],
    queryFn: async () => {
      const data = await api.get<CoverLetter>(`/cover-letters/${coverLetterId}`);
      setCoverLetter(data);
      return data;
    },
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  // Auto-save with 2-second debounce
  const autoSave = useCallback(async () => {
    if (!coverLetter || !isDirty) return;

    setSaving(true);
    try {
      const updateData: UpdateCoverLetterData = {
        title: coverLetter.title,
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
    } catch (error) {
      console.error('Auto-save failed:', error);
      toast.error(t('coverLetters.save_failed'));
    } finally {
      setSaving(false);
    }
  }, [coverLetter, isDirty, coverLetterId, setSaving, setLastSavedAt, t]);

  useEffect(() => {
    if (isDirty) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(autoSave, 2000);
    }
    return () => clearTimeout(saveTimerRef.current);
  }, [isDirty, autoSave]);

  // Manual save
  const handleManualSave = () => {
    clearTimeout(saveTimerRef.current);
    autoSave();
  };

  // AI improve handler with credit check
  const handleAIImprove = () => {
    // Check AI credits
    const aiCreditsUsed = user?.usage?.aiCreditsUsed || 0;
    const aiCreditsLimit = user?.usage?.aiCreditsLimit || 5;

    if (aiCreditsUsed >= aiCreditsLimit) {
      setShowUpgradeModal(true);
      return;
    }

    aiMutation.mutate();
  };

  // AI improve mutation
  const aiMutation = useMutation({
    mutationFn: () =>
      api.post<CoverLetter>(`/cover-letters/${coverLetterId}/ai/generate`),
    onSuccess: (data) => {
      setCoverLetter(data);
      if (editor && !editor.isDestroyed) {
        editor.commands.setContent(data.content);
      }
      toast.success(t('coverLetters.ai_improved'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Export handlers
  const handleExport = async (format: 'pdf' | 'docx') => {
    setExportMenuOpen(false);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'}/cover-letters/${coverLetterId}/export/${format}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${await getToken()}`,
          },
        },
      );

      if (!response.ok) throw new Error('Export failed');

      const data = await response.json();

      // Download the file from the returned URL
      const fileResponse = await fetch(data.downloadUrl);
      const blob = await fileResponse.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${coverLetter?.title || 'cover-letter'}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(t('coverLetters.exported', { format: format.toUpperCase() }));
    } catch {
      toast.error(t('coverLetters.export_failed'));
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
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

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col -m-4 sm:-m-6 lg:-m-8">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-2 dark:border-stone-700 dark:bg-stone-900">
        <div className="flex items-center gap-3">
          <Link href="/cover-letters">
            <button className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800">
              <ArrowLeft className="h-5 w-5" />
            </button>
          </Link>
          <input
            type="text"
            value={coverLetter.title}
            onChange={(e) => updateField('title', e.target.value)}
            className="border-none bg-transparent text-lg font-semibold text-stone-900 outline-none focus:ring-0 dark:text-white"
            placeholder={t('coverLetters.untitled')}
          />
        </div>

        <div className="flex items-center gap-2">
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

          {/* Export dropdown */}
          <div className="relative">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setExportMenuOpen(!exportMenuOpen)}
              icon={<FileDown className="h-4 w-4" />}
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
                <div className="absolute end-0 z-20 mt-1 w-44 rounded-lg border border-stone-200 bg-white py-1 shadow-lg dark:border-stone-700 dark:bg-stone-800">
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

      {/* Split view */}
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Editor panel */}
        <div className="flex w-full flex-col overflow-hidden border-e border-stone-200 dark:border-stone-700 lg:w-1/2">
          {/* Formatting toolbar */}
          {editor && (
            <div className="flex flex-wrap items-center gap-0.5 border-b border-stone-200 bg-stone-50 px-2 py-1 dark:border-stone-700 dark:bg-stone-800">
              <ToolbarButton
                active={editor.isActive('bold')}
                onClick={() => editor.chain().focus().toggleBold().run()}
                title="Bold"
              >
                <Bold className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                active={editor.isActive('italic')}
                onClick={() => editor.chain().focus().toggleItalic().run()}
                title="Italic"
              >
                <Italic className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                active={editor.isActive('underline')}
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                title="Underline"
              >
                <Underline className="h-4 w-4" />
              </ToolbarButton>

              <div className="mx-1 h-5 w-px bg-stone-300 dark:bg-stone-600" />

              <ToolbarButton
                active={editor.isActive('bulletList')}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                title="Bullet List"
              >
                <List className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                active={editor.isActive('orderedList')}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                title="Ordered List"
              >
                <ListOrdered className="h-4 w-4" />
              </ToolbarButton>

              <div className="mx-1 h-5 w-px bg-stone-300 dark:bg-stone-600" />

              <ToolbarButton
                active={editor.isActive({ textAlign: 'left' })}
                onClick={() => editor.chain().focus().setTextAlign('left').run()}
                title="Align Left"
              >
                <AlignLeft className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                active={editor.isActive({ textAlign: 'center' })}
                onClick={() => editor.chain().focus().setTextAlign('center').run()}
                title="Align Center"
              >
                <AlignCenter className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                active={editor.isActive({ textAlign: 'right' })}
                onClick={() => editor.chain().focus().setTextAlign('right').run()}
                title="Align Right"
              >
                <AlignRight className="h-4 w-4" />
              </ToolbarButton>

              <div className="mx-1 h-5 w-px bg-stone-300 dark:bg-stone-600" />

              <ToolbarButton
                onClick={() => editor.chain().focus().undo().run()}
                disabled={!editor.can().undo()}
                title="Undo"
              >
                <Undo2 className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().redo().run()}
                disabled={!editor.can().redo()}
                title="Redo"
              >
                <Redo2 className="h-4 w-4" />
              </ToolbarButton>

              <div className="mx-1 h-5 w-px bg-stone-300 dark:bg-stone-600" />

              {/* Font Family Selector */}
              <select
                value={coverLetter.styling?.fontFamily || 'Inter'}
                onChange={(e) => updateStyling('fontFamily', e.target.value)}
                className="text-xs rounded px-2 py-1 bg-white dark:bg-stone-700 border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300"
                title="Font Family"
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
                title="Font Size"
              >
                <option value="12px">12px</option>
                <option value="14px">14px</option>
                <option value="16px">16px</option>
                <option value="18px">18px</option>
                <option value="20px">20px</option>
              </select>
            </div>
          )}

          {/* Editor content */}
          <div className="flex-1 overflow-y-auto bg-white dark:bg-stone-900">
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* Preview panel */}
        <div className="hidden w-1/2 overflow-y-auto bg-stone-100 p-6 dark:bg-stone-800 lg:block">
          <div className="mx-auto max-w-[21cm] rounded-lg bg-white p-10 shadow-md dark:bg-stone-900">
            <LetterPreview coverLetter={coverLetter} />
          </div>
        </div>
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

// Helper to get auth token for export
async function getToken(): Promise<string> {
  const { auth } = await import('@/lib/firebase');
  if (!auth) return '';
  const user = auth.currentUser;
  if (!user) return '';
  return user.getIdToken();
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

function LetterPreview({ coverLetter }: { coverLetter: CoverLetter }) {
  const t = useTranslations();

  return (
    <div
      className="space-y-6 text-sm text-stone-800 dark:text-stone-200"
      style={{
        fontFamily: coverLetter.styling?.fontFamily || 'Georgia, serif',
        fontSize: coverLetter.styling?.fontSize || '14px',
      }}
    >
      {/* Date */}
      <p className="text-stone-500">{formatDate(new Date())}</p>

      {/* Recipient info */}
      {(coverLetter.recipientName || coverLetter.companyName) && (
        <div className="space-y-0.5">
          {coverLetter.recipientName && (
            <p className="font-medium">{coverLetter.recipientName}</p>
          )}
          {coverLetter.recipientTitle && <p>{coverLetter.recipientTitle}</p>}
          {coverLetter.companyName && <p>{coverLetter.companyName}</p>}
          {coverLetter.companyAddress && (
            <p className="text-stone-500">{coverLetter.companyAddress}</p>
          )}
        </div>
      )}

      {/* Subject / Job title */}
      {coverLetter.jobTitle && (
        <p className="font-semibold">
          {t('coverLetters.re')}: {coverLetter.jobTitle}
        </p>
      )}

      {/* Body content */}
      {coverLetter.content ? (
        <div
          className="prose prose-sm dark:prose-invert max-w-none leading-relaxed"
          dangerouslySetInnerHTML={{ __html: coverLetter.content }}
        />
      ) : (
        <p className="italic text-stone-400">{t('coverLetters.preview_empty')}</p>
      )}
    </div>
  );
}
