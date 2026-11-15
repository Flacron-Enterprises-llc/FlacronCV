import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type {
  BusinessCandidateStatus,
  BusinessCandidateView,
  BusinessMemberships,
  BusinessOverview,
  BusinessQueueItem,
  BusinessReport,
  BusinessRole,
  BusinessStaffRole,
  BusinessStaffView,
  BusinessUsage,
} from '../../../../../packages/career-api-client/src/types';
import { formatCurrency, formatDate, hasKey, t } from '../../i18n';
import { careerErrorMessage } from '../career-view';

/**
 * Business workspace view logic (website: components/career/scope/BusinessPanel.tsx
 * and scope-actions.tsx). One screen serves every role: the account holder and
 * managers run the workspace, counselors see assigned candidates and the
 * shared queue, billing administrators see usage and invoices only, and an
 * invited candidate manages their own membership. What each part shows comes
 * from the role's scope the API returns; the API enforces it.
 *
 * Copy is the website's (`career.scope.*`), kept under `careerBusiness.scope`.
 */

const S = (key: string, values?: Record<string, string | number>) => t(`careerBusiness.scope.${key}`, values);
const camel = (value: string) => value.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

export const STAFF_ROLES: readonly BusinessStaffRole[] = ['counselor', 'manager', 'billing_admin'];

export function roleLabel(role: BusinessRole): string {
  return S(camel(`role_${role}`));
}

export function roleScope(role: BusinessRole): string {
  return S(camel(`role_${role}_scope`));
}

export function candidateStatusLabel(status: BusinessCandidateStatus): string {
  return S(camel(`candidate_status_${status}`));
}

export function inviteStateLabel(state: BusinessCandidateView['inviteState']): string {
  return S(camel(`invite_state_${state}`));
}

export function staffStatusLabel(status: BusinessStaffView['status']): string {
  return S(camel(`staff_status_${status}`));
}

export function queueStatusLabel(status: BusinessQueueItem['status']): string {
  return S(camel(`queue_status_${status}`));
}

/** A usage unit's name; an unknown unit shows its id. */
export function unitLabel(unit: string): string {
  const key = `careerBusiness.scope.${camel(`unit_${unit}`)}`;
  return hasKey(key) ? t(key) : unit;
}

export interface WorkspaceChoice {
  workspaceId: string;
  label: string;
  /** The `workspaceId` to send to the API: undefined for the caller's own workspace. */
  acting: string | undefined;
}

/** The workspaces the caller can act in: their own first, then each one they are staff of. */
export function workspaceChoices(memberships: BusinessMemberships): WorkspaceChoice[] {
  return [
    ...(memberships.ownsWorkspace ? [{ workspaceId: memberships.ownWorkspaceId, label: S('workspaceOwn'), acting: undefined }] : []),
    ...memberships.staffOf.map((staff, index) => ({
      workspaceId: staff.workspaceId,
      label: S('workspaceStaff', { n: index + 1, role: roleLabel(staff.role) }),
      acting: staff.workspaceId === memberships.ownWorkspaceId ? undefined : staff.workspaceId,
    })),
  ];
}

/** No workspace of their own, no staff seat, no candidate membership: the page explains the plan. */
export function hasNoBusinessRole(memberships: BusinessMemberships | undefined): boolean {
  return Boolean(memberships && !memberships.ownsWorkspace && memberships.staffOf.length === 0 && memberships.candidateOf.length === 0);
}

export function seatsLine(view: Pick<BusinessOverview, 'capacity'>): string {
  return S('seatsLine', {
    staffUsed: view.capacity.staffUsed,
    staffSeats: view.capacity.staffSeats ?? 0,
    candidatesUsed: view.capacity.candidatesUsed,
    activeCandidates: view.capacity.activeCandidates ?? 0,
  });
}

/** Active counselors a candidate can be assigned to. */
export function assignableCounselors(view: Pick<BusinessOverview, 'staff'>): BusinessStaffView[] {
  return view.staff.filter((member) => member.role === 'counselor' && member.status === 'active');
}

export function assignableCandidates(view: Pick<BusinessOverview, 'candidates'>): BusinessCandidateView[] {
  return view.candidates.filter((candidate) => candidate.status !== 'archived');
}

export function activeCandidates(view: Pick<BusinessOverview, 'candidates'>): BusinessCandidateView[] {
  return view.candidates.filter((candidate) => candidate.status === 'active');
}

/** How a staff member is named: their email, else their account ID, else the seat id. */
export function staffName(member: Pick<BusinessStaffView, 'email' | 'authUserId' | 'id'>): string {
  return member.email ?? member.authUserId ?? member.id;
}

/** Which actions a manager has on one candidate row. */
export function candidateActions(candidate: Pick<BusinessCandidateView, 'status' | 'inviteState'>, manage: boolean) {
  return {
    revoke: manage && candidate.status === 'invited' && candidate.inviteState === 'pending',
    archive: manage && candidate.status === 'active',
    reactivate: manage && candidate.status === 'archived',
  };
}

/**
 * The full invitation link to share while email is not connected. The path
 * comes from the API (`/career/business/join?token=…`); the website serves it
 * under a locale prefix. Null when this build has no website origin.
 */
export function inviteLink(invitePath: string, origin: string | null, locale: string): string | null {
  if (!origin) return null;
  return `${origin.replace(/\/+$/, '')}/${locale}${invitePath.startsWith('/') ? invitePath : `/${invitePath}`}`;
}

/** The token inside an invitation path or link. */
export function inviteToken(invitePath: string): string | null {
  return tokenFromInput(invitePath);
}

/**
 * The invitation token from what the person pasted: a whole link, a path, or
 * the bare token. Returns null when nothing usable is there.
 */
export function tokenFromInput(input: string | null | undefined): string | null {
  const value = (input ?? '').trim();
  if (!value) return null;
  const match = /[?&]token=([^&#\s]+)/.exec(value);
  let token = match ? match[1] : value;
  try {
    token = decodeURIComponent(token);
  } catch {
    return null;
  }
  token = token.trim();
  if (!token || /[\s/?#&]/.test(token) || token.length > 512) return null;
  return token;
}

/** The invitation note above the link (sent by email, or not sent). */
export function inviteNote(invitation: { delivered: boolean; expiresAt: string }): string {
  const date = formatDate(new Date(invitation.expiresAt));
  return invitation.delivered ? S('inviteSent', { date }) : S('inviteNotSent', { date });
}

export function unitLeft(unit: BusinessUsage['units'][number]): string {
  return S('unitLeft', { remaining: unit.remaining, granted: unit.granted });
}

/** One invoice line: amount (or a dash when unknown), date, and "refunded". */
export function invoiceLine(invoice: NonNullable<BusinessUsage['invoices']>[number]): string {
  const amount =
    invoice.amountCents !== null && invoice.currency ? formatCurrency(invoice.amountCents / 100, invoice.currency) : '—';
  const parts = [amount, formatDate(new Date(invoice.purchasedAt))];
  if (invoice.refunded) parts.push(S('refunded'));
  return parts.join(' · ');
}

/** The aggregate report's tiles, in the website's order. Counts only. */
export function reportRows(report: BusinessReport): { key: string; label: string; value: number }[] {
  return [
    { key: 'invited', label: candidateStatusLabel('invited'), value: report.candidates.invited },
    { key: 'active', label: candidateStatusLabel('active'), value: report.candidates.active },
    { key: 'archived', label: candidateStatusLabel('archived'), value: report.candidates.archived },
    { key: 'sharing', label: S('reportSharing'), value: report.sharingCandidates },
    { key: 'assignments', label: S('reportAssignments'), value: report.assignments },
    { key: 'recommended', label: S('reportRecommended'), value: report.queue.recommended },
  ];
}

/** Whose queue item it is: "Recommended to …" or nothing. */
export function queueFor(item: Pick<BusinessQueueItem, 'candidateId'>, candidates: readonly Pick<BusinessCandidateView, 'id' | 'email'>[]): string | null {
  if (!item.candidateId) return null;
  return S('queueFor', { email: candidates.find((candidate) => candidate.id === item.candidateId)?.email ?? '' });
}

/** A queue link is opened only when it is a web address. */
export function safeQueueUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** Website `errorNote`: an API refusal mapped to the message for the action that was refused. */
export function scopeErrorKey(error: unknown, notForSale = 'closedBody'): string | null {
  if (!(error instanceof ApiError)) return null;
  switch (error.code) {
    case 'plan_upgrade_required':
      return 'upgradeBody';
    case 'quota_exhausted':
      return 'quotaUsedBody';
    case 'capacity_exceeded':
      return 'quotaBody';
    case 'not_purchasable':
      return notForSale;
    case 'permission_denied':
      return 'permissionBody';
    case 'not_found':
      return 'notFoundBody';
    case 'feature_unavailable':
      return 'offBody';
    case 'provider_unavailable':
      return 'providerBody';
    case 'validation_error':
      return error.body?.field === 'attribution' ? 'attributionBody' : 'invalidBody';
    default:
      return null;
  }
}

/** The message for a refused or failed action. Never claims that anything was saved. */
export function scopeErrorMessage(error: unknown, notForSale = 'closedBody'): string {
  const key = scopeErrorKey(error, notForSale);
  if (key) return S(key);
  return careerErrorMessage(error, S('failedBody'));
}

/** Join refusals have their own wording. */
export function joinErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'not_found') return S('joinInvalid');
  if (error instanceof ApiError && error.code === 'permission_denied') return S('joinWrongEmail');
  return scopeErrorMessage(error);
}

export function joinDoneMessage(kind: 'staff' | 'candidate'): string {
  return kind === 'staff' ? S('joinDoneStaff') : S('joinDoneCandidate');
}

/** A loose email shape check before inviting; the API validates for real. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
