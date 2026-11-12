import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { ActionPack } from '../../../../../packages/career-api-client/src/types';
import {
  actionPackErrorMessage,
  checklistProgress,
  creditsLeft,
  fitLabel,
  fitTone,
  keyForAction,
  opportunityLabel,
  PROVIDER_UNAVAILABLE_MESSAGE,
  replacePack,
  sortPacks,
  withChecklistItem,
} from './action-packs';

function pack(id: string, createdAt: string, checklist = [{ id: 'a', label: 'A', done: false }, { id: 'b', label: 'B', done: true }]): ActionPack {
  return {
    id,
    opportunityId: 'o',
    opportunityRevisionId: 'r',
    vacancySnapshot: { title: 'Analyst', organization: null, description: '', sourceUrl: null, deadline: null, checkedAt: createdAt, revisionId: 'r' },
    profileSnapshot: [],
    fit: { fit: 'partial', overlap: 1, reasons: [], gaps: [], unknowns: [] },
    tailoredResume: { title: '', lines: [], factIds: [] },
    coverLetter: { title: '', body: '', factIds: [] },
    checklist,
    nextSteps: [],
    createdAt,
    updatedAt: createdAt,
  };
}

describe('keyForAction', () => {
  it('reuses the key for a retry of the same action and makes a new one when the input changes', () => {
    let n = 0;
    const make = () => `k${++n}`;
    const first = keyForAction(null, 'opp-1', make);
    expect(first.key).toBe('k1');
    expect(keyForAction(first, 'opp-1', make)).toBe(first);
    expect(keyForAction(first, 'opp-2', make).key).toBe('k2');
  });
});

describe('labels', () => {
  it('maps fit to label and tone, with a fallback', () => {
    expect(fitLabel('strong')).toBe('STRONG FIT');
    expect(fitTone('strong')).toBe('success');
    expect(fitTone('blocked')).toBe('warning');
    expect(fitLabel('weird')).toBe('WEIRD');
    expect(fitTone('weird')).toBe('default');
  });

  it('names an unstated organization', () => {
    expect(opportunityLabel({ title: 'Analyst', organization: null })).toBe('Analyst — Unstated organization');
    expect(opportunityLabel({ title: 'Analyst', organization: 'Acme' })).toBe('Analyst — Acme');
  });

  it('adds included and pack credits, null when unknown', () => {
    expect(creditsLeft({ includedRemaining: 3, packRemaining: 2 })).toBe(5);
    expect(creditsLeft(undefined)).toBeNull();
  });
});

describe('checklist', () => {
  it('counts and toggles one item without touching others', () => {
    const p = pack('1', '2026-01-01T00:00:00Z');
    expect(checklistProgress(p)).toEqual({ done: 1, total: 2 });
    const next = withChecklistItem(p, 'a', true);
    expect(checklistProgress(next)).toEqual({ done: 2, total: 2 });
    expect(p.checklist[0].done).toBe(false);
  });

  it('replaces by id and sorts newest first', () => {
    const a = pack('a', '2026-01-01T00:00:00Z');
    const b = pack('b', '2026-02-01T00:00:00Z');
    expect(sortPacks([a, b]).map((x) => x.id)).toEqual(['b', 'a']);
    const updated = withChecklistItem(a, 'a', true);
    expect(replacePack([a, b], updated)[0]).toBe(updated);
  });
});

describe('actionPackErrorMessage', () => {
  it('explains each refusal and says no credit was used', () => {
    expect(actionPackErrorMessage(new ApiError(503, 'provider_unavailable', { code: 'provider_unavailable' }))).toBe(PROVIDER_UNAVAILABLE_MESSAGE);
    expect(actionPackErrorMessage(new ApiError(400, 'validation_error', { code: 'validation_error', field: 'facts', reason: 'no_confirmed_facts' }))).toMatch(/career profile/);
    expect(actionPackErrorMessage(new ApiError(400, 'validation_error', { code: 'validation_error', field: 'opportunityId' }))).toMatch(/valid opportunity/);
    expect(actionPackErrorMessage(new ApiError(402, 'quota_exhausted', { code: 'quota_exhausted' }))).toMatch(/No action pack credits/);
    expect(actionPackErrorMessage(new ApiError(403, 'plan_upgrade_required', { code: 'plan_upgrade_required' }))).toMatch(/not included/);
    expect(actionPackErrorMessage(new ApiError(0, 'network_error', { code: 'network_error' }))).toMatch(/No connection/);
    expect(actionPackErrorMessage(new Error('x'))).toMatch(/No credit was used/);
  });
});
