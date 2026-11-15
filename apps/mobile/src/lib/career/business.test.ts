import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { BusinessCandidateView, BusinessOverview, BusinessStaffView } from '../../../../../packages/career-api-client/src/types';
import {
  activeCandidates,
  assignableCandidates,
  assignableCounselors,
  candidateActions,
  candidateStatusLabel,
  hasNoBusinessRole,
  inviteLink,
  inviteNote,
  inviteStateLabel,
  inviteToken,
  invoiceLine,
  joinErrorMessage,
  looksLikeEmail,
  queueFor,
  queueStatusLabel,
  reportRows,
  roleLabel,
  roleScope,
  safeQueueUrl,
  scopeErrorMessage,
  seatsLine,
  staffName,
  staffStatusLabel,
  tokenFromInput,
  unitLabel,
  unitLeft,
  workspaceChoices,
} from './business';

const staff = (over: Partial<BusinessStaffView>): BusinessStaffView => ({
  id: 's1',
  role: 'counselor',
  status: 'active',
  email: null,
  authUserId: null,
  expiresAt: null,
  assignedCandidateIds: [],
  ...over,
});
const candidate = (over: Partial<BusinessCandidateView>): BusinessCandidateView => ({
  id: 'c1',
  email: 'a@example.com',
  status: 'active',
  inviteState: 'accepted',
  shareProfile: false,
  expiresAt: null,
  counselorIds: [],
  ...over,
});
const err = (code: string, body: Record<string, unknown> = {}) => new ApiError(400, code, { error: code, ...body } as never);

describe('business workspace', () => {
  it('lists the own workspace first, then staff seats, acting only for others', () => {
    const choices = workspaceChoices({
      ownsWorkspace: true,
      ownWorkspaceId: 'own',
      staffOf: [{ workspaceId: 'w2', role: 'manager' }],
      candidateOf: [],
    });
    expect(choices).toEqual([
      { workspaceId: 'own', label: 'My workspace', acting: undefined },
      { workspaceId: 'w2', label: 'Workspace 1 (Manager)', acting: 'w2' },
    ]);
    expect(workspaceChoices({ ownsWorkspace: false, ownWorkspaceId: 'own', staffOf: [], candidateOf: [] })).toEqual([]);
  });

  it('knows when the caller has no business role at all', () => {
    expect(hasNoBusinessRole({ ownsWorkspace: false, ownWorkspaceId: 'x', staffOf: [], candidateOf: [] })).toBe(true);
    expect(
      hasNoBusinessRole({ ownsWorkspace: false, ownWorkspaceId: 'x', staffOf: [], candidateOf: [{ candidateId: 'c', workspaceId: 'w', status: 'active', shareProfile: false }] }),
    ).toBe(false);
    expect(hasNoBusinessRole(undefined)).toBe(false);
  });

  it('words roles, scopes and statuses', () => {
    expect(roleLabel('owner')).toBe('Account holder');
    expect(roleLabel('billing_admin')).toBe('Billing administrator');
    expect(roleScope('counselor')).toMatch(/assigned to them/);
    expect(candidateStatusLabel('archived')).toBe('Archived');
    expect(inviteStateLabel('pending')).toBe('Waiting for acceptance');
    expect(staffStatusLabel('revoked')).toBe('Revoked');
    expect(queueStatusLabel('recommended')).toBe('Recommended');
    expect(unitLabel('voice_minute')).toBe('Voice minutes');
    expect(unitLabel('mystery_unit')).toBe('mystery_unit');
  });

  it('shows seats, treating an unknown capacity as zero like the website', () => {
    expect(seatsLine({ capacity: { staffSeats: 5, staffUsed: 2, activeCandidates: null, candidatesUsed: 1 } })).toBe(
      'Staff seats: 2 of 5. Active candidates: 1 of 0. Archived candidates do not count.',
    );
  });

  it('offers only active counselors and non-archived candidates for assignment', () => {
    const view: Pick<BusinessOverview, 'staff' | 'candidates'> = {
      staff: [staff({ id: 'a' }), staff({ id: 'b', status: 'invited' }), staff({ id: 'c', role: 'manager' })],
      candidates: [candidate({ id: '1' }), candidate({ id: '2', status: 'archived' }), candidate({ id: '3', status: 'invited', inviteState: 'pending' })],
    };
    expect(assignableCounselors(view).map((m) => m.id)).toEqual(['a']);
    expect(assignableCandidates(view).map((c) => c.id)).toEqual(['1', '3']);
    expect(activeCandidates(view).map((c) => c.id)).toEqual(['1']);
    expect(staffName(staff({ email: 'x@y.z', authUserId: 'u' }))).toBe('x@y.z');
    expect(staffName(staff({ authUserId: 'u' }))).toBe('u');
    expect(staffName(staff({ id: 'seat' }))).toBe('seat');
  });

  it('allows manager actions only where they apply', () => {
    expect(candidateActions({ status: 'invited', inviteState: 'pending' }, true)).toEqual({ revoke: true, archive: false, reactivate: false });
    expect(candidateActions({ status: 'invited', inviteState: 'expired' }, true)).toEqual({ revoke: false, archive: false, reactivate: false });
    expect(candidateActions({ status: 'active', inviteState: 'accepted' }, true)).toEqual({ revoke: false, archive: true, reactivate: false });
    expect(candidateActions({ status: 'archived', inviteState: 'accepted' }, true)).toEqual({ revoke: false, archive: false, reactivate: true });
    expect(candidateActions({ status: 'active', inviteState: 'accepted' }, false)).toEqual({ revoke: false, archive: false, reactivate: false });
  });

  it('builds the invitation link with the locale, or none without a website origin', () => {
    const path = '/career/business/join?token=bst_abc';
    expect(inviteLink(path, 'https://flacroncv.com/', 'fr')).toBe('https://flacroncv.com/fr/career/business/join?token=bst_abc');
    expect(inviteLink(path, null, 'en')).toBeNull();
    expect(inviteToken(path)).toBe('bst_abc');
  });

  it('reads the token from a pasted link, a path or a bare code', () => {
    expect(tokenFromInput('https://flacroncv.com/en/career/business/join?token=bst_x1&utm=1')).toBe('bst_x1');
    expect(tokenFromInput('  bst_plain  ')).toBe('bst_plain');
    expect(tokenFromInput('flacroncv://career/business/join?token=bst%5Fenc')).toBe('bst_enc');
    expect(tokenFromInput('')).toBeNull();
    expect(tokenFromInput(undefined)).toBeNull();
    expect(tokenFromInput('two words')).toBeNull();
    expect(tokenFromInput('https://example.com/no-token')).toBeNull();
    expect(tokenFromInput('?token=%E0%A4%A')).toBeNull();
  });

  it('says honestly whether the invitation was emailed', () => {
    expect(inviteNote({ delivered: false, expiresAt: '2026-11-28T00:00:00Z' })).toMatch(/^Email is not connected yet, so nothing was sent/);
    expect(inviteNote({ delivered: true, expiresAt: '2026-11-28T00:00:00Z' })).toMatch(/^Invitation emailed/);
  });

  it('words usage, invoices and the aggregate report', () => {
    expect(unitLeft({ unit: 'action_pack', granted: 10, remaining: 4 })).toBe('4 left of 10 included');
    expect(invoiceLine({ sku: 'x', kind: 'plan', amountCents: null, currency: null, purchasedAt: '2026-10-01T00:00:00Z', refunded: true })).toMatch(/^— · .+ · refunded$/);
    expect(invoiceLine({ sku: 'x', kind: 'plan', amountCents: 1999, currency: 'usd', purchasedAt: '2026-10-01T00:00:00Z', refunded: false })).toMatch(/\$19\.99/);
    const rows = reportRows({
      candidates: { invited: 1, active: 2, archived: 3 },
      staff: { manager: 1, counselor: 2, billing_admin: 0 },
      assignments: 4,
      sharingCandidates: 5,
      queue: { open: 1, recommended: 6, closed: 0 },
    });
    expect(rows.map((row) => row.value)).toEqual([1, 2, 3, 5, 4, 6]);
    expect(rows[3].label).toBe('Sharing with staff');
  });

  it('names who a queue item is for and opens only web links', () => {
    expect(queueFor({ candidateId: 'c1' }, [candidate({})])).toBe('Recommended to a@example.com');
    expect(queueFor({ candidateId: null }, [])).toBeNull();
    expect(safeQueueUrl('https://jobs.example.com/1')).toBe('https://jobs.example.com/1');
    expect(safeQueueUrl('javascript:alert(1)')).toBeNull();
    expect(safeQueueUrl('not a url')).toBeNull();
    expect(safeQueueUrl(null)).toBeNull();
  });

  it('maps refusals like the website and never claims a save', () => {
    expect(scopeErrorMessage(err('plan_upgrade_required'))).toBe('Nothing was saved.');
    expect(scopeErrorMessage(err('capacity_exceeded'))).toMatch(/allowance|Nothing extra/);
    expect(scopeErrorMessage(err('permission_denied'))).toMatch(/another workspace/);
    expect(scopeErrorMessage(err('validation_error', { field: 'attribution' }))).toBe('The attribution must include FlacronCV.');
    expect(scopeErrorMessage(err('validation_error', { field: 'email' }))).toBe('Check the fields and try again.');
    expect(scopeErrorMessage(err('not_purchasable'), 'apiPackageMissing')).toMatch(/API package/);
    expect(scopeErrorMessage(new Error('boom'))).toBe('Nothing extra was used.');
    expect(joinErrorMessage(err('not_found'))).toMatch(/expired, was revoked/);
    expect(joinErrorMessage(err('permission_denied'))).toMatch(/different email/);
  });

  it('checks the email shape before inviting', () => {
    expect(looksLikeEmail(' a@b.co ')).toBe(true);
    expect(looksLikeEmail('nope')).toBe(false);
  });
});
