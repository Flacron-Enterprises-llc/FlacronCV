import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { ActionPack } from '../../../../../packages/career-api-client/src/types';
import {
  balanceText,
  canAddChecklistRow,
  checklistEdit,
  checklistLabel,
  checklistRows,
  downloadErrorMessage,
  exportTitle,
  factsToAddBack,
  fitEdit,
  fitLines,
  isEditable,
  isEdited,
  letterEdit,
  moveRow,
  nextStepsEdit,
  nextStepTexts,
  normalizePack,
  preselectedOpportunity,
  resumeEdit,
  resumeRows,
  saveDocumentsErrorMessage,
  savedToDocuments,
  splitLines,
} from './action-packs';

function pack(patch: Partial<ActionPack> = {}): ActionPack {
  return {
    id: 'p1',
    status: 'complete',
    opportunityId: 'o1',
    opportunityRevisionId: 'r1',
    vacancySnapshot: { title: 'Analyst', organization: 'Acme', description: '', sourceUrl: null, deadline: null, checkedAt: '2026-01-01', revisionId: 'r1' },
    profileSnapshot: [
      { id: 'f1', factType: 'skill', value: { name: 'SQL' } },
      { id: 'f2', factType: 'skill', value: { name: 'Python' } },
      { id: 'f3', factType: 'nonsense', value: { name: 'x' } },
    ],
    fit: { fit: 'partial', overlap: 1, reasons: ['Old reason'], gaps: ['Old gap'], unknowns: [], reasonTokens: ['sql'], gapTokens: ['excel', 'tableau'] },
    tailoredResume: { title: 'CV', lines: [{ factId: 'f1', factType: 'skill', text: 'SQL', uncertain: false }], factIds: ['f1'] },
    coverLetter: { title: 'Letter', body: 'Dear team', factIds: [] },
    checklist: [
      { id: 'review_resume', label: 'Review the tailored resume for Analyst at Acme', done: false },
      { id: 'own-1', label: 'Call Sam', done: true },
    ],
    nextSteps: ['stored step'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...patch,
  };
}

describe('reading a pack', () => {
  it('hides the unstated organization marker and knows what can be edited', () => {
    expect(normalizePack(pack({ vacancySnapshot: { ...pack().vacancySnapshot, organization: 'unstated' } })).vacancySnapshot.organization).toBeNull();
    expect(isEditable(pack())).toBe(true);
    expect(isEditable(pack({ status: 'partial' }))).toBe(true);
    expect(isEditable(pack({ status: 'generating' }))).toBe(false);
    expect(isEditable(pack({ status: 'expired' }))).toBe(false);
    expect(isEditable(pack({ status: undefined }))).toBe(true);
    expect(isEdited(pack({ editedComponents: ['fit'] }), 'fit')).toBe(true);
    expect(isEdited(pack(), 'fit')).toBe(false);
  });

  it('translates fit words, keeps older sentences, and shows edited fit as written', () => {
    expect(fitLines(pack())).toEqual({
      reasons: ['Your confirmed facts mention “sql”'],
      gaps: [
        'The listing asks for “excel”, which your confirmed facts do not show',
        'The listing asks for “tableau”, which your confirmed facts do not show',
      ],
    });
    const legacy = pack({ fit: { ...pack().fit, reasonTokens: undefined, gapTokens: undefined } });
    expect(fitLines(legacy)).toEqual({ reasons: ['Old reason'], gaps: ['Old gap'] });
    expect(fitLines(pack({ editedComponents: ['fit'] }))).toEqual({ reasons: ['Old reason'], gaps: ['Old gap'] });
  });

  it('translates built-in checklist items and keeps the person’s own', () => {
    const p = pack();
    expect(checklistLabel(p, p.checklist[0])).toBe('Review the tailored resume for Analyst at Acme');
    expect(checklistLabel({ vacancySnapshot: { ...p.vacancySnapshot, organization: null } }, p.checklist[0])).toBe('Review the tailored resume for Analyst');
    expect(checklistLabel(p, p.checklist[1])).toBe('Call Sam');
  });

  it('derives next steps from the fit unless the person rewrote them', () => {
    const steps = nextStepTexts(pack());
    expect(steps).toHaveLength(4);
    expect(steps[2]).toBe('Add evidence or projects for the 2 missing skills.');
    expect(nextStepTexts(pack({ editedComponents: ['nextSteps'] }))).toEqual(['stored step']);
  });
});

describe('editing a pack', () => {
  it('splits one item per line', () => {
    expect(splitLines(' a \n\n b\n')).toEqual(['a', 'b']);
    expect(fitEdit('a\nb', ' c ')).toEqual({ fit: { reasons: ['a', 'b'], gaps: ['c'] } });
    expect(nextStepsEdit('x\n y ')).toEqual({ nextSteps: ['x', 'y'] });
    expect(letterEdit(' T ', ' Body ')).toEqual({ coverLetter: { title: 'T', body: 'Body' } });
  });

  it('moves rows within bounds', () => {
    expect(moveRow([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moveRow([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveRow([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });

  it('only offers confirmed facts frozen in the pack that are not on the résumé', () => {
    const p = pack();
    const rows = resumeRows(p);
    expect(factsToAddBack(p, rows)).toEqual([{ factId: 'f2', factType: 'skill', text: 'Python' }]);
    expect(resumeEdit(' New ', [...rows, { factId: 'f2', factType: 'skill', text: ' Python ' }])).toEqual({
      tailoredResume: { title: 'New', lines: [{ factId: 'f1', text: 'SQL' }, { factId: 'f2', text: 'Python' }] },
    });
  });

  it('sends unchanged built-in checklist items by id, reworded and new ones with a label, drops blanks', () => {
    const rows = checklistRows(pack());
    rows[1] = { ...rows[1], label: 'Call Sam on Monday' };
    rows.push({ original: '', label: ' Print CV ', done: false }, { original: '', label: '  ', done: false });
    expect(checklistEdit(rows)).toEqual({
      checklist: [
        { id: 'review_resume', done: false },
        { id: 'own-1', label: 'Call Sam on Monday', done: true },
        { id: undefined, label: 'Print CV', done: false },
      ],
    });
    expect(canAddChecklistRow(new Array(29).fill(0))).toBe(true);
    expect(canAddChecklistRow(new Array(30).fill(0))).toBe(false);
  });
});

describe('using a pack', () => {
  it('knows when copies are already in Documents', () => {
    expect(savedToDocuments(pack())).toBe(false);
    expect(savedToDocuments(pack({ savedDocuments: { resumeId: 'r', resumeVersionId: 'v', letterDocumentId: null } }))).toBe(true);
  });

  it('names a download after the component title', () => {
    expect(exportTitle(pack(), 'tailoredResume')).toBe('CV');
    expect(exportTitle(pack({ coverLetter: null }), 'coverLetter')).toBe('Letter title');
  });

  it('preselects only an opportunity that exists', () => {
    const items = [{ id: 'o1' }, { id: 'o2' }];
    expect(preselectedOpportunity('o2', items)).toBe('o2');
    expect(preselectedOpportunity(['o1'], items)).toBe('o1');
    expect(preselectedOpportunity('nope', items)).toBeNull();
    expect(preselectedOpportunity(undefined, items)).toBeNull();
  });

  it('states the balance before a paid pack', () => {
    expect(balanceText(null)).toBe('Balance not loaded');
    expect(balanceText(0)).toBe('No credits left');
    expect(balanceText(1)).toBe('1 credit left');
  });

  it('maps save and download refusals', () => {
    expect(saveDocumentsErrorMessage(new ApiError(409, 'capacity_exceeded', { code: 'capacity_exceeded' }))).toMatch(/full/);
    expect(saveDocumentsErrorMessage(new ApiError(402, 'plan_upgrade_required', { code: 'plan_upgrade_required' }))).toMatch(/not included/);
    expect(downloadErrorMessage(new ApiError(402, 'plan_upgrade_required', { code: 'plan_upgrade_required' }))).toMatch(/DOCX/);
    expect(downloadErrorMessage(new Error('x'))).toMatch(/did not work/);
  });
});
