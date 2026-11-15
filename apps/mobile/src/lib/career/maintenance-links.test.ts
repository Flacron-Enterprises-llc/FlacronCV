import { describe, expect, it } from 'vitest';
import { checkPromotion, EMPTY_PROMOTION, factOptionLabel, linksOf, NO_LINKS, withLinks } from './maintenance';

describe('links', () => {
  it('reads and writes optional fact and evidence links (blank clears)', () => {
    expect(linksOf({ factId: null, evidenceId: 'e1' })).toEqual({ factId: '', evidenceId: 'e1' });
    expect(withLinks({ title: 'A' }, NO_LINKS)).toEqual({ title: 'A', factId: null, evidenceId: null });
    expect(withLinks({ title: 'A' }, { factId: 'f1', evidenceId: '' })).toEqual({ title: 'A', factId: 'f1', evidenceId: null });
  });

  it('names facts like the website', () => {
    expect(factOptionLabel({ factType: 'experience', value: { position: 'Analyst', company: 'Acme' } })).toBe('Analyst · Acme');
    expect(factOptionLabel({ factType: 'skill', value: { name: 'SQL' } })).toBe('SQL');
    expect(factOptionLabel({ factType: 'summary', value: {} })).toBe('summary');
  });
});

describe('checkPromotion', () => {
  it('updates a chosen role, or needs an employer for a new role', () => {
    expect(checkPromotion({ ...EMPTY_PROMOTION, factId: 'f1', company: 'ignored' })).toEqual({ ok: true, input: { experienceFactId: 'f1' } });
    expect(checkPromotion(EMPTY_PROMOTION)).toMatchObject({ ok: false, field: 'factId' });
    expect(checkPromotion({ ...EMPTY_PROMOTION, company: ' Acme ' })).toEqual({ ok: true, input: { company: 'Acme', startDate: null } });
    expect(checkPromotion({ ...EMPTY_PROMOTION, company: 'Acme', startDate: '2026-02-30' })).toMatchObject({ ok: false, field: 'startDate' });
    expect(checkPromotion({ ...EMPTY_PROMOTION, company: 'Acme', startDate: '2026-03-01' })).toEqual({ ok: true, input: { company: 'Acme', startDate: '2026-03-01' } });
  });
});
