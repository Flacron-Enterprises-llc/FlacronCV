'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { createV1CoverLetter, createV1Cv, planV1Cv } from '@/lib/career/to-v1';
import { ResumeScreen } from '../resume/ResumeScreen';

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
  const tSections = useTranslations('cv_builder');
  const formatApiError = useApiErrorMessage();
  const router = useRouter();
  const { api, user } = props;
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [letters, setLetters] = useState<WritingDocument[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

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
    setBusy(resume.id);
    try {
      const [detail, facts] = await Promise.all([api.resume(resume.id), api.facts()]);
      if (!detail.version) {
        toast.error(t('no_version'));
        return;
      }
      // The client types templateId as a string; the converter only checks it against V1's ids.
      const plan = planV1Cv(detail.version.body as ResumeBody, facts.items, resume.title, (type) => tSections(SECTION_TITLE_KEY[type]));
      const cvId = await createV1Cv(v1Api, plan);
      toast.success(t('copied_cv'));
      router.push(`/cv/${cvId}`);
    } catch (error) {
      toast.error(formatApiError(error, t('copy_failed')));
    } finally {
      setBusy(null);
    }
  }

  async function copyLetter(letter: WritingDocument) {
    setBusy(letter.id);
    try {
      const id = await createV1CoverLetter(v1Api, { title: letter.title, body: letter.body });
      toast.success(t('copied_letter'));
      router.push(`/cover-letters/${id}`);
    } catch (error) {
      toast.error(formatApiError(error, t('copy_failed')));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
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
      <ResumeScreen {...props} />
    </div>
  );
}
