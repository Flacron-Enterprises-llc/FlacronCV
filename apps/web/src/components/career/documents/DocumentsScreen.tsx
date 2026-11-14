'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { FileText, Mail } from 'lucide-react';
import type { ApiClient, Resume, WritingDocument } from '@flacroncv/career-api-client';
import type { ResumeBody, SharedCvSectionType } from '@flacroncv/career-shared';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { api as v1Api } from '@/lib/api';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import { useRouter } from '@/i18n/routing';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { createV1CoverLetter, createV1Cv, PartialV1CopyError, planV1Cv } from '@/lib/career/to-v1';
import { ResumeScreen } from '../resume/ResumeScreen';
import { confirmLeaveIfUnsaved } from '../ui/UnsavedChangesGuard';
import { PageHeader } from '../ui';

/** V1 `cv_builder.*` keys for section titles, so the copy reads like a CV made in V1. */
const SECTION_TITLE_KEY: Record<SharedCvSectionType, string> = {
  experience: 'experience',
  education: 'education',
  skills: 'skills',
  projects: 'projects',
  certifications: 'certifications',
  languages: 'languages',
  references: 'references',
  awards: 'custom',
  publications: 'custom',
  volunteer: 'custom',
  custom: 'custom',
};

/**
 * Profile-grounded drafts (the former V2 resume studio and writing tools),
 * plus a one-way copy into V1's CV builder and cover-letter editor. V1 stays
 * the place where CVs and letters are edited, exported and kept.
 */
export function DocumentsScreen(props: { api: ApiClient; user: SignedInUser | null; ready: boolean; signInHref: string }) {
  const t = useTranslations('career.documents');
  const tResume = useTranslations('career.resume');
  const tSections = useTranslations('cv_builder');
  const formatApiError = useApiErrorMessage();
  const router = useRouter();
  const { api, user } = props;
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [letters, setLetters] = useState<WritingDocument[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  // Synchronous guard: a second click before React re-renders must not create a second V1 document.
  const inFlight = useRef(false);
  // Draft id -> V1 document created by a copy that failed part-way; a retry fills that one instead of creating another.
  const partial = useRef<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [resumeList, writing] = await Promise.all([api.resumes(), api.writingDocuments()]);
      setResumes(resumeList.items);
      setLetters(writing.items.filter((item) => item.type === 'cover_letter'));
    } catch {
      // The studio below shows its own load errors.
    }
  }, [api, user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function copyResume(resume: Resume) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(resume.id);
    try {
      const [detail, facts] = await Promise.all([api.resume(resume.id), api.facts()]);
      if (!detail.version) {
        toast.error(t('no_version'));
        return;
      }
      // The client types templateId as a string; the converter only checks it against V1's ids.
      const plan = planV1Cv(detail.version.body as ResumeBody, facts.items, resume.title, (type) => tSections(SECTION_TITLE_KEY[type]));
      const cvId = await createV1Cv(v1Api, plan, partial.current[resume.id]);
      delete partial.current[resume.id];
      toast.success(t('copied_cv'));
      // The copy is made; opening it leaves the studio, so unsaved studio edits are asked about first.
      if (await confirmLeaveIfUnsaved()) router.push(`/cv/${cvId}`);
    } catch (error) {
      if (error instanceof PartialV1CopyError) partial.current[resume.id] = error.v1Id;
      toast.error(formatApiError(error instanceof PartialV1CopyError ? error.cause : error, t('copy_failed')));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  async function copyLetter(letter: WritingDocument) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(letter.id);
    try {
      // The list above is loaded once; the studio below may have saved newer text since. Copy the latest saved letter.
      const latest = await api.writingDocument(letter.id);
      const id = await createV1CoverLetter(v1Api, { title: latest.title, body: latest.body }, partial.current[letter.id]);
      delete partial.current[letter.id];
      toast.success(t('copied_letter'));
      if (await confirmLeaveIfUnsaved()) router.push(`/cover-letters/${id}`);
    } catch (error) {
      if (error instanceof PartialV1CopyError) partial.current[letter.id] = error.v1Id;
      toast.error(formatApiError(error instanceof PartialV1CopyError ? error.cause : error, t('copy_failed')));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* The page title comes first; the studio below does not repeat it. */}
      <PageHeader title={tResume('title')} description={tResume('studio_lede')} />
      {resumes.length > 0 || letters.length > 0 ? (
        <Card padding="md">
          <h2 className="text-base font-semibold text-stone-900 dark:text-white">{t('copy_title')}</h2>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">{t('copy_body')}</p>
          <ul className="mt-3 divide-y divide-stone-200 dark:divide-stone-700">
            {resumes.map((resume) => (
              <li key={resume.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="flex min-w-0 items-center gap-2 text-sm text-stone-800 dark:text-stone-100">
                  <FileText className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                  <span className="truncate">{resume.title}</span>
                </span>
                <Button size="sm" variant="outline" loading={busy === resume.id} disabled={busy !== null} onClick={() => void copyResume(resume)}>
                  {t('open_in_cv_builder')}
                </Button>
              </li>
            ))}
            {letters.map((letter) => (
              <li key={letter.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="flex min-w-0 items-center gap-2 text-sm text-stone-800 dark:text-stone-100">
                  <Mail className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                  <span className="truncate">{letter.title}</span>
                </span>
                <Button size="sm" variant="outline" loading={busy === letter.id} disabled={busy !== null} onClick={() => void copyLetter(letter)}>
                  {t('save_as_cover_letter')}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <ResumeScreen {...props} hideTitle />
    </div>
  );
}
