import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import { AIResponse } from '../types/api.types';

/** Matches GenerateCvSummaryDto. language is optional; the API defaults to English. */
export type GenerateCvSummaryRequest = {
  experience: string;
  skills: string;
  targetRole: string;
  language?: string;
};

export function useGenerateSummary() {
  return useMutation({
    mutationFn: (data: GenerateCvSummaryRequest) =>
      api.post<AIResponse>('/ai/cv-summary', data),
  });
}

/** Matches AtsCheckDto (string, required, max 50000 / 20000). No extra keys. */
export type AtsCheckRequest = {
  cvContent: string;
  jobDescription: string;
};

const CV_CONTENT_MAX = 50000;
const JOB_DESCRIPTION_MAX = 20000;

function clampDto(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}

/**
 * POST /ai/ats-check body is exactly AtsCheckDto.
 * Sending `{ type, context }` (the old AIGenerateRequest) is a 400 before
 * reserveAiCredit — that mismatch shipped twice. Only these two keys, clamped.
 */
export function useATSCheck() {
  return useMutation({
    mutationFn: (data: AtsCheckRequest) =>
      api.post<AIResponse>('/ai/ats-check', {
        cvContent: clampDto(data.cvContent, CV_CONTENT_MAX),
        jobDescription: clampDto(data.jobDescription, JOB_DESCRIPTION_MAX),
      }),
  });
}

/** Matches InterviewPrepDto: jobDescription required max 20000; cvContent optional max 50000. */
export type InterviewPrepRequest = {
  jobDescription: string;
  cvContent?: string;
};

/**
 * POST /ai/interview-prep body is exactly InterviewPrepDto.
 * Only jobDescription + optional cvContent. No extra keys.
 */
export function useInterviewPrep() {
  return useMutation({
    mutationFn: (data: InterviewPrepRequest) => {
      const body: { jobDescription: string; cvContent?: string } = {
        jobDescription: clampDto(data.jobDescription, JOB_DESCRIPTION_MAX),
      };
      if (data.cvContent !== undefined) {
        body.cvContent = clampDto(data.cvContent, CV_CONTENT_MAX);
      }
      return api.post<AIResponse>('/ai/interview-prep', body);
    },
  });
}

/** Matches GenerateJobDescriptionDto (jobTitle required max 200; others optional). */
export type GenerateJobDescriptionRequest = {
  jobTitle: string;
  companyName?: string;
  language?: string;
};

/** No UI yet. Body matches GenerateJobDescriptionDto: { jobTitle, companyName?, language? }. */
export function useGenerateJobDescription() {
  return useMutation({
    mutationFn: (data: GenerateJobDescriptionRequest) =>
      api.post<AIResponse>('/ai/generate-job-description', data),
  });
}
