import { readFileSync } from 'fs';
import { join } from 'path';
import { parseAdzuna, parseGreenhouse, parseLever, parseUsajobs } from './normalize';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8')) as unknown;
}

describe('recorded job feeds', () => {
  it('reads Adzuna and does not invent pay that the listing left out', () => {
    const listings = parseAdzuna(fixture('adzuna.json'));
    expect(listings).toHaveLength(2);
    expect(listings[0]).toMatchObject({
      provider: 'adzuna',
      sourceId: 'adz-1',
      organization: 'Babbage Works',
      title: 'Ledger analyst',
      compensation: { minimum: null, maximum: null },
    });
    expect(listings[1]?.compensation).toMatchObject({ minimum: 28000, maximum: 32000 });
    const predicted = parseAdzuna({
      results: [
        {
          id: 'p',
          title: 'Analyst',
          company: { display_name: 'Babbage Works' },
          salary_min: 99999,
          salary_is_predicted: true,
        },
      ],
    });
    expect(predicted[0]?.compensation.minimum).toBeNull();
  });

  it('reads USAJOBS, Greenhouse, and Lever fixtures', () => {
    const federal = parseUsajobs(fixture('usajobs.json'));
    expect(federal[0]).toMatchObject({
      provider: 'usajobs',
      sourceId: 'usa-1',
      organization: 'Example Records Office',
      deadline: '2020-01-01',
      compensation: { minimum: 40000, maximum: 52000, period: 'Per Year' },
    });
    const board = parseGreenhouse(fixture('greenhouse.json'), 'Babbage Works');
    expect(board[0]).toMatchObject({ provider: 'greenhouse', sourceId: '4401', organization: 'Babbage Works' });
    expect(board[0]?.description).not.toContain('<p>');
    expect(board[0]?.description).toContain('other feed');
    const lever = parseLever(fixture('lever.json'), 'Harbour Office');
    expect(lever[0]).toMatchObject({ provider: 'lever', sourceId: 'lev-1', title: 'Dock planner', locations: ['Dover'] });
  });
});
