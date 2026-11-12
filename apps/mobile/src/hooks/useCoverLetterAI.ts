import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { buildDraftRequest, buildParagraphRequest, readAiContent } from '../lib/cover-letter-ai';
import { serializeCVToText } from '../lib/serialize-cv';
import { useAuthStore } from '../store/auth-store';
import { AIResponse } from '../types/api.types';
import type { CoverLetterLength, CoverLetterTone } from '../types/cover-letter.types';
import type { CV, CVSection } from '../types/cv.types';

/** Re-read the credit balance after every AI call, success or failure (refunds). */
async function refreshCredits(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['user'] });
  try {
    await useAuthStore.getState().syncUser();
  } catch {
    /* the balance refreshes on the next sync */
  }
}

/**
 * Plain-text summary of the linked CV for the prompt. A CV that cannot be read
 * does not block generation — same as the website, the letter is then written
 * from the job details alone.
 */
async function candidateSummaryFor(cvId: string): Promise<string> {
  if (!cvId) return '';
  try {
    const [cv, sections] = await Promise.all([
      api.get<CV>(`/cvs/${cvId}`),
      api.get<CVSection[]>(`/cvs/${cvId}/sections`),
    ]);
    return serializeCVToText(cv, sections);
  } catch {
    return '';
  }
}

export interface CoverLetterDraftInput {
  jobTitle: string;
  jobDescription: string;
  companyName: string;
  linkedCVId: string;
  tone: CoverLetterTone;
  length: CoverLetterLength;
}

/**
 * POST /ai/cover-letter — the website create page's "Generate with AI". Returns
 * the draft text for review; nothing is created, so a failure leaves no empty
 * letter and no used cover-letter slot (the credit is refunded server-side).
 */
export function useGenerateCoverLetterDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CoverLetterDraftInput) => {
      const candidateSummary = await candidateSummaryFor(input.linkedCVId);
      const res = await api.post<AIResponse>(
        '/ai/cover-letter',
        buildDraftRequest({ ...input, candidateSummary }),
      );
      return readAiContent(res);
    },
    onSettled: () => refreshCredits(qc),
  });
}

/**
 * POST /ai/regenerate-paragraph — rewrite ONE paragraph with the whole letter
 * as context. Returns the suggestion only; the caller applies it after review.
 */
export function useRegenerateParagraph() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { letterText: string; paragraph: string }) => {
      const res = await api.post<AIResponse>(
        '/ai/regenerate-paragraph',
        buildParagraphRequest(vars.letterText, vars.paragraph),
      );
      return readAiContent(res);
    },
    onSettled: () => refreshCredits(qc),
  });
}
