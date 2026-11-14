import { isApiError, type WritingContextInput, type WritingType } from '@flacroncv/career-api-client';
import { JobApplication, JobStatus } from '@flacroncv/shared-types';
import { boardStatus } from './job-workspace';

/** The career writing types the application workspace offers. */
export type ApplicationDraftType = Extract<WritingType, 'referral_request' | 'thank_you'>;

export type DraftProblem = 'quota' | 'upgrade' | 'unavailable' | 'unsupported' | 'missing' | 'missing_target' | 'failed';

const clip = (value: string | null | undefined, max: number): string | undefined => {
  const text = (value ?? '').trim();
  return text ? text.slice(0, max) : undefined;
};

/**
 * What the person wrote on the application, sent as the draft's target when
 * there is no saved listing. Only their own words: the server may repeat these,
 * never add to them. Empty fields are left out.
 */
export function draftContextOf(
  job: Pick<JobApplication, 'company' | 'position' | 'interviewDate' | 'contactName'> & { contacts?: JobApplication['contacts'] },
): WritingContextInput {
  const contact = job.contacts?.[0];
  const interview = typeof job.interviewDate === 'string' ? job.interviewDate.slice(0, 10) : '';
  const context: WritingContextInput = {
    organization: clip(job.company, 200),
    role: clip(job.position, 200),
    contactName: clip(contact?.name ?? job.contactName, 200),
    contactRole: clip(contact?.role, 200),
    interviewDate: /^\d{4}-\d{2}-\d{2}$/.test(interview) ? interview : undefined,
  };
  return Object.fromEntries(Object.entries(context).filter(([, v]) => v !== undefined)) as WritingContextInput;
}

/** Which drafts make sense at this stage: a referral before/around applying, thanks after an interview. */
export function draftTypesFor(job: Pick<JobApplication, 'status' | 'interviewDate'>): ApplicationDraftType[] {
  const status = boardStatus(job.status);
  const types: ApplicationDraftType[] = [];
  if (status === JobStatus.SAVED || status === JobStatus.PREPARING || status === JobStatus.APPLIED) {
    types.push('referral_request');
  }
  if (status === JobStatus.INTERVIEWING || status === JobStatus.OFFERED || (job.interviewDate && status === JobStatus.APPLIED)) {
    types.push('thank_you');
  }
  return types;
}

/** Career API refusal → the honest state shown to the user. */
export function problemOf(error: unknown): DraftProblem {
  if (isApiError(error, 'quota_exhausted')) return 'quota';
  if (isApiError(error, 'plan_upgrade_required') || isApiError(error, 'permission_denied')) return 'upgrade';
  if (isApiError(error, 'provider_unavailable')) return 'unavailable';
  // Neither a saved listing nor the application's own company/role to write about.
  if (isApiError(error, 'validation_error') && error.body.reason === 'missing_target') return 'missing_target';
  // The writing type is not accepted (yet) by this career service.
  if (isApiError(error, 'validation_error')) return 'unsupported';
  if (isApiError(error, 'not_found')) return 'missing';
  return 'failed';
}
