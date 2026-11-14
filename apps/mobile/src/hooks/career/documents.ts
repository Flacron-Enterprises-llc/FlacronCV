import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useRef } from 'react';
import type { WritingContextInput, WritingDocument, WritingType } from '../../../../../packages/career-api-client/src/types';
import { careerApi } from '../../lib/career-api';
import { createPaidKeys } from '../../lib/career/documents';
import { useEntitled, useUid } from '../useCareer';

/**
 * Career drafts beyond open/edit/save (those stay in hooks/useCareer.ts):
 * create, template switch, confirm, versions, readability and the paid
 * generate / tailor / write actions. Every key starts ['career', uid, ...].
 * The resume's versions live under its own key, so invalidating the resume
 * also refreshes them.
 */

export function useResumeVersions(resumeId: string | undefined) {
  const { uid, entitled } = useEntitled();
  return useQuery({
    queryKey: ['career', uid, 'resume', resumeId, 'versions'],
    queryFn: () => careerApi.resumeVersions(resumeId as string),
    enabled: entitled && Boolean(resumeId),
  });
}

function useRefreshResume(resumeId: string | undefined) {
  const queryClient = useQueryClient();
  const uid = useUid();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['career', uid, 'resume', resumeId] });
    void queryClient.invalidateQueries({ queryKey: ['career', uid, 'resumes'] });
  };
}

/** Creating a CV is free (no credit); it is composed from the facts on file. */
export function useCreateResume() {
  const queryClient = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: (input: { title: string; language: 'en' | 'fr'; templateId?: string }) => careerApi.createResume(input),
    onSuccess: (created) => {
      queryClient.setQueryData(['career', uid, 'resume', created.id], created);
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'resumes'] });
    },
  });
}

/** Template switch; typed lines are saved with it (see lib templatePatch). Revision-checked. */
export function useResumeVersionPatch(resumeId: string | undefined) {
  const refresh = useRefreshResume(resumeId);
  return useMutation({
    mutationFn: (input: {
      versionId: string;
      patch: { templateId?: string; confirmation?: 'draft' | 'confirmed'; lines?: Array<{ factId: string; text: string }>; expectedRevision?: number };
    }) => careerApi.updateResumeVersion(input.versionId, input.patch),
    onSuccess: refresh,
  });
}

export function useReadability() {
  return useMutation({ mutationFn: (versionId: string) => careerApi.readability(versionId) });
}

/** One key store per screen; Crypto.randomUUID per new action, reused for a retry of the same action. */
export function usePaidKeys() {
  const ref = useRef<ReturnType<typeof createPaidKeys> | null>(null);
  ref.current ??= createPaidKeys(() => Crypto.randomUUID());
  return ref.current;
}

async function settlePaid<T>(keys: ReturnType<typeof createPaidKeys>, action: string, run: (key: string) => Promise<T>): Promise<T> {
  const key = keys.keyFor(action);
  try {
    const result = await run(key);
    keys.settle(action);
    return result;
  } catch (error) {
    keys.settle(action, error);
    throw error;
  }
}

/** Generate (opportunityId null) or tailor to a saved opportunity. Uses one document credit on success. */
export function usePaidResume(resumeId: string | undefined) {
  const queryClient = useQueryClient();
  const uid = useUid();
  const keys = usePaidKeys();
  const refresh = useRefreshResume(resumeId);
  return useMutation({
    mutationFn: (input: { opportunityId: string | null }) => {
      const id = resumeId as string;
      return input.opportunityId
        ? settlePaid(keys, `tailor:${id}:${input.opportunityId}`, (key) => careerApi.tailorResume(id, input.opportunityId as string, key))
        : settlePaid(keys, `generate:${id}`, (key) => careerApi.generateResume(id, '', key));
    },
    onSuccess: () => {
      refresh();
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'usage'] });
    },
  });
}

/**
 * Write a cover letter, bio, LinkedIn text, outreach, referral request or
 * thank-you draft from confirmed facts. Uses one document credit. The context
 * is part of the key, so changed notes are a new request, never a replay.
 */
export function useCreateWriting() {
  const queryClient = useQueryClient();
  const uid = useUid();
  const keys = usePaidKeys();
  return useMutation({
    mutationFn: (input: { type: WritingType; opportunityId: string | null; templateId?: string; context?: WritingContextInput }) =>
      settlePaid(
        keys,
        `write:${input.type}:${input.opportunityId ?? ''}:${input.templateId ?? ''}:${input.context ? JSON.stringify(input.context) : ''}`,
        (key) => careerApi.createWriting(input, key),
      ),
    onSuccess: (paid) => {
      queryClient.setQueryData(['career', uid, 'writing', paid.document.id], paid.document);
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'writing'], exact: true });
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'resumes'] });
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'usage'] });
    },
  });
}

/** Cover-letter layout switch; typed text is saved together with it. Revision-checked. */
export function useLetterTemplate(documentId: string | undefined) {
  const queryClient = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: (input: { templateId: string; body?: string; expectedRevision?: number }) =>
      careerApi.updateWriting(documentId as string, input),
    onSuccess: (saved: WritingDocument) => {
      queryClient.setQueryData(['career', uid, 'writing', documentId], saved);
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'writing'], exact: true });
    },
  });
}
