import { describe, expect, it } from 'vitest';
import { cosine, explainMatch, fakeEmbedding, matchTokens } from './match';

describe('explainMatch', () => {
  const listing = {
    status: 'open' as const,
    deadline: null,
    title: 'Ledger analyst',
    description: 'Keep the ledger. SQL is required. COBOL is mentioned.',
    locations: ['London'],
    payKnown: false,
    sponsorship: 'unknown' as const,
  };

  it('uses a confirmed fact, leaves a draft unknown, and does not call the overlap a hire chance', () => {
    const explained = explainMatch(
      listing,
      [
        { factId: 's1', text: 'SQL', confirmed: true },
        { factId: 'e1', text: 'COBOL at SecretCo', confirmed: false },
      ],
      '2026-10-17',
    );
    expect(explained.reasons).toEqual([{ code: 'confirmed_overlap', factId: 's1', token: 'sql' }]);
    expect(explained.unknowns).toContainEqual({ code: 'unconfirmed', factId: 'e1', token: 'cobol' });
    expect(explained.unknowns).toContainEqual({ code: 'pay' });
    expect(explained.unknowns).toContainEqual({ code: 'sponsorship' });
    expect(explained.gaps.some((gap) => gap.token === 'cobol' || gap.token === 'sql')).toBe(false);
    expect(explained.fit === 'partial' || explained.fit === 'strong').toBe(true);
    expect(JSON.stringify(explained)).not.toContain('hiring');
    expect(Object.keys(explained)).not.toContain('score');
  });

  it('blocks an expired listing even when a fact overlaps', () => {
    const explained = explainMatch(
      { ...listing, deadline: '2020-01-01' },
      [{ factId: 's1', text: 'SQL', confirmed: true }],
      '2026-10-17',
    );
    expect(explained.fit).toBe('blocked');
    expect(explained.reasons[0]?.token).toBe('sql');
  });

  it('embeds the same words the same way', () => {
    const left = fakeEmbedding('SQL ledger');
    expect(cosine(left, fakeEmbedding('ledger SQL'))).toBe(1);
    expect(cosine(left, fakeEmbedding(''))).toBe(0);
  });
});

describe('matchTokens', () => {
  it('drops vacancy framing words and bare numbers so gaps name requirements', () => {
    expect(matchTokens('We are looking for someone to build our hybrid team in 2026 using PostgreSQL')).toEqual(['someone', 'postgresql']);
    const explained = explainMatch(
      { status: 'open', deadline: null, title: 'Analyst', description: 'Looking to build a hybrid team. Tableau required.', locations: [], payKnown: false, sponsorship: 'unknown' },
      [{ factId: 's1', text: 'SQL', confirmed: true }],
      '2026-10-17',
    );
    expect(explained.gaps.map((gap) => gap.token)).toEqual(['analyst', 'tableau']);
  });
});
