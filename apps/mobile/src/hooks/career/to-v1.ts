import { useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { AccessibilityInfo, Alert } from 'react-native';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { ResumeBody } from '../../../../../packages/career-shared/src/resume';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import { requestFailureMessage } from '../../lib/api-errors';
import { careerApi } from '../../lib/career-api';
import { createV1CoverLetter, createV1Cv, PartialV1CopyError, planV1Cv, SECTION_TITLE_TYPE } from '../../lib/career/to-v1';
import { careerErrorMessage } from '../../lib/career-view';
import { sectionTypeLabel } from '../../lib/cv-editor';

/**
 * "Copy to my CVs / cover letters" (website: DocumentsScreen copyResume /
 * copyLetter). Reads the latest saved draft, creates a new V1 document through
 * V1's own endpoints (V1 plan limits apply), then opens it in the V1 editor.
 * The draft is not changed. A copy that fails part-way remembers the new V1
 * id, so tapping again fills that document instead of creating a second one
 * (V1 counts every creation against the plan).
 */
export function useCopyToV1() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  // Synchronous guard: a second tap before React re-renders must not create a second V1 document.
  const inFlight = useRef(false);
  // Draft id -> V1 document created by a copy that failed part-way.
  const partial = useRef<Record<string, string>>({});

  const run = async (draftId: string, copy: (resumeInto?: string) => Promise<string | null>, open: (v1Id: string) => Href, done: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(draftId);
    try {
      const v1Id = await copy(partial.current[draftId]);
      if (!v1Id) return;
      delete partial.current[draftId];
      AccessibilityInfo.announceForAccessibility(done);
      router.push(open(v1Id));
    } catch (error) {
      if (error instanceof PartialV1CopyError) partial.current[draftId] = error.v1Id;
      Alert.alert(t('careerHub.copy.failed'), copyFailureMessage(error));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const copyResume = (resumeId: string) =>
    run(
      resumeId,
      async (resumeInto) => {
        const [detail, facts] = await Promise.all([careerApi.resume(resumeId), careerApi.facts()]);
        if (!detail.version) {
          Alert.alert(t('careerHub.copy.failed'), t('careerHub.copy.noVersion'));
          return null;
        }
        // The client types the body loosely; the converter only checks the template id against V1's ids.
        const plan = planV1Cv(detail.version.body as ResumeBody, facts.items, detail.title, (type) => sectionTypeLabel(SECTION_TITLE_TYPE[type]));
        const id = await createV1Cv(api, plan, resumeInto);
        void queryClient.invalidateQueries({ queryKey: ['cvs'] });
        return id;
      },
      (id) => `/(dashboard)/cvs/${id}` as Href,
      t('careerHub.copy.copiedCv'),
    );

  const copyLetter = (documentId: string) =>
    run(
      documentId,
      async (resumeInto) => {
        // Copy the latest saved text, not what this screen loaded earlier.
        const latest = await careerApi.writingDocument(documentId);
        const id = await createV1CoverLetter(api, { title: latest.title, body: latest.body }, resumeInto);
        void queryClient.invalidateQueries({ queryKey: ['cover-letters'] });
        return id;
      },
      (id) => `/(dashboard)/cover-letters/${id}` as Href,
      t('careerHub.copy.copiedLetter'),
    );

  return { busy, copyResume, copyLetter };
}

/** The career service's or V1's reason, in the current language when known; a part-way copy says how to finish it. */
export function copyFailureMessage(error: unknown): string {
  const cause = error instanceof PartialV1CopyError ? error.cause : error;
  const fallback = t('careerHub.copy.failed');
  const reason = cause instanceof ApiError ? careerErrorMessage(cause, fallback) : requestFailureMessage(cause, fallback);
  return error instanceof PartialV1CopyError ? [t('careerHub.copy.partial'), reason === fallback ? '' : reason].filter(Boolean).join(' ') : reason;
}
