import { describe, expect, it } from 'vitest';
import { applyActionPackEdit, defaultActionPackChecklist, tailorActionPackResume } from './action-pack';
import type { EditablePackParts } from './action-pack';
import type { ResumeFactInput } from './resume';

function fact(id: string, factType: ResumeFactInput['factType'], value: Record<string, unknown>, confirmed = true): ResumeFactInput {
  return { id, factType, value, confirmation: confirmed ? 'confirmed' : 'draft', uncertain: {} };
}

const facts: ResumeFactInput[] = [
  fact('c1', 'contact', { fullName: 'Ada Lovelace', email: 'ada@example.test' }),
  fact('e1', 'experience', { position: 'Barista', company: 'Corner Cafe', startDate: '2015-01', endDate: '2016-01' }),
  fact('e2', 'experience', { position: 'Data Engineer', company: 'Northwind', startDate: '2019-03', endDate: '2024-06' }),
  fact('s1', 'skill', { name: 'Latte art' }),
  fact('s2', 'skill', { name: 'PostgreSQL' }),
  fact('s3', 'skill', { name: 'Kubernetes' }, false),
  fact('l1', 'language', { name: 'French', proficiency: 'fluent' }),
];

const listing = 'Data Engineer. You will build PostgreSQL pipelines and Kubernetes jobs for our data platform.';

describe('tailorActionPackResume', () => {
  it('puts the most relevant confirmed facts first and drops unmatched optional ones', () => {
    const out = tailorActionPackResume(facts, listing);
    expect(out.lines[0].factId).toBe('c1');
    // The data role outranks the cafe job, and both roles are kept.
    const roles = out.lines.filter((line) => line.factType === 'experience').map((line) => line.factId);
    expect(roles).toEqual(['e2', 'e1']);
    // Only the matching skill stays; the other is listed as omitted.
    expect(out.factIds).toContain('s2');
    expect(out.factIds).not.toContain('s1');
    expect(out.omittedFactIds).toContain('s1');
    expect(out.relevance.s2).toEqual(['postgresql']);
  });

  it('never uses a draft fact, even one that matches the listing', () => {
    const out = tailorActionPackResume(facts, listing);
    expect(out.factIds).not.toContain('s3');
    expect(out.omittedFactIds).not.toContain('s3');
    expect(JSON.stringify(out)).not.toContain('Kubernetes');
  });

  it('keeps a whole optional section when nothing in it matches', () => {
    const out = tailorActionPackResume(facts, listing);
    expect(out.factIds).toContain('l1');
  });

  it('writes no text of its own: every line is the fact text', () => {
    const out = tailorActionPackResume(facts, listing);
    expect(out.lines.find((line) => line.factId === 'e2')?.text).toBe('Data Engineer · Northwind · 2019-03 · 2024-06');
  });
});

function parts(): EditablePackParts {
  return {
    fit: { fit: 'partial', overlap: 0.2, reasons: ['r'], gaps: ['g'], unknowns: ['pay'], reasonTokens: ['sql'], gapTokens: ['cobol'] },
    tailoredResume: { title: 'Tailored', lines: [], factIds: [], relevance: { e2: ['data'] } },
    coverLetter: { title: 'Letter', body: 'Old body', factIds: ['e2'] },
    checklist: defaultActionPackChecklist('Analyst', null),
    nextSteps: ['one'],
    profileSnapshot: [
      { id: 'e2', factType: 'experience', value: { position: 'Data Engineer' } },
      { id: 's2', factType: 'skill', value: { name: 'PostgreSQL' } },
    ],
  };
}

describe('applyActionPackEdit', () => {
  const newId = () => 'custom-1';

  it('saves typed résumé lines in the given order for confirmed snapshot facts only', () => {
    const ok = applyActionPackEdit(parts(), { tailoredResume: { lines: [{ factId: 's2', text: 'PostgreSQL (5 years)' }, { factId: 'e2', text: 'Data Engineer' }] } }, newId);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.parts.tailoredResume.factIds).toEqual(['s2', 'e2']);
      expect(ok.parts.tailoredResume.relevance).toEqual({ e2: ['data'] });
      expect(ok.edited).toEqual(['tailoredResume']);
    }
    const foreign = applyActionPackEdit(parts(), { tailoredResume: { lines: [{ factId: 'invented', text: 'COBOL expert' }] } }, newId);
    expect(foreign).toEqual({ ok: false, field: 'tailoredResume.lines', reason: 'unknown_fact' });
  });

  it('lists a fact the person removed as omitted so it can be added back', () => {
    const ok = applyActionPackEdit(parts(), { tailoredResume: { lines: [{ factId: 'e2', text: 'Data Engineer' }] } }, newId);
    expect(ok.ok && ok.parts.tailoredResume.omittedFactIds).toEqual(['s2']);
  });

  it('edits the letter, the fit sentences, next steps and checklist', () => {
    const ok = applyActionPackEdit(
      parts(),
      {
        coverLetter: { body: 'New body' },
        fit: { reasons: ['Five years of SQL'], gaps: [] },
        nextSteps: ['Call Jane', ' '],
        checklist: [{ id: 'check_deadline', done: true }, { id: 'review_resume', label: 'Print it', done: false }, { label: 'Ask a referee', done: false }],
      },
      (() => {
        let n = 0;
        return () => `custom-${++n}`;
      })(),
    );
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.parts.coverLetter?.body).toBe('New body');
    expect(ok.parts.coverLetter?.factIds).toEqual(['e2']);
    expect(ok.parts.fit.reasons).toEqual(['Five years of SQL']);
    expect(ok.parts.fit.reasonTokens).toBeUndefined();
    expect(ok.parts.fit.fit).toBe('partial');
    expect(ok.parts.nextSteps).toEqual(['Call Jane']);
    expect(ok.parts.checklist.map((item) => item.id)).toEqual(['check_deadline', 'custom-1', 'custom-2']);
    expect(ok.parts.checklist[0].done).toBe(true);
    expect(ok.parts.checklist[1].label).toBe('Print it');
  });

  it('refuses an empty letter, a letter that does not exist yet, and an empty edit', () => {
    expect(applyActionPackEdit(parts(), { coverLetter: { body: '   ' } }, newId)).toMatchObject({ ok: false, field: 'coverLetter' });
    expect(applyActionPackEdit({ ...parts(), coverLetter: null }, { coverLetter: { body: 'x' } }, newId)).toMatchObject({ ok: false, reason: 'not_ready' });
    expect(applyActionPackEdit(parts(), {}, newId)).toMatchObject({ ok: false, reason: 'empty' });
    expect(applyActionPackEdit(parts(), { checklist: [{ id: 'nope', done: true }] }, newId)).toMatchObject({ ok: false, field: 'checklist' });
  });
});
