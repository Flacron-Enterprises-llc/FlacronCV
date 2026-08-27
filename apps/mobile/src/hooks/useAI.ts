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

/** Matches AtsCheckDto (string, required, max 50000 / 20000). */
export type AtsCheckRequest = {
  cvContent: string;
  jobDescription: string;
};

/** No UI yet. Body matches AtsCheckDto: { cvContent, jobDescription }. */
export function useATSCheck() {
  return useMutation({
    mutationFn: (data: AtsCheckRequest) =>
      api.post<AIResponse>('/ai/ats-check', data),
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
