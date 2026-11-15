import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import { PROVIDER_UNAVAILABLE_MESSAGE } from './action-packs';
import {
  addRoute,
  amountLabel,
  BLANK_ROUTE,
  buildScenarioOptions,
  confirmBody,
  MAX_ROUTES,
  monthsLabel,
  payLabel,
  payToCents,
  removeRoute,
  resultToDrafts,
  routeProblem,
  routeToInput,
  savedScenarioErrorMessage,
  scenarioErrorMessage,
  scenarioSignature,
  sourceLabel,
  uncertaintyLabel,
  updateRoute,
  wageLabelText,
  wholeOrBlank,
  type RouteDraft,
} from './scenarios';

const route = (patch: Partial<RouteDraft>): RouteDraft => ({ ...BLANK_ROUTE, name: 'Stay', destination: 'London', ...patch });

describe('routes', () => {
  it('adds up to three and never removes the last one', () => {
    let routes = [route({})];
    routes = addRoute(addRoute(addRoute(routes)));
    expect(routes).toHaveLength(MAX_ROUTES);
    expect(removeRoute([route({})], 0)).toHaveLength(1);
    expect(removeRoute(routes, 0)).toHaveLength(2);
    expect(updateRoute(routes, 1, { name: 'Move' })[1].name).toBe('Move');
  });
});

describe('numbers', () => {
  it('reads whole currency units as cents and keeps blanks unknown (never 0)', () => {
    expect(payToCents('')).toBeNull();
    expect(payToCents('55 000')).toBe(5_500_000);
    expect(payToCents('55,000.50')).toBe(5_500_050);
    expect(payToCents('-1')).toBeNaN();
    expect(payToCents('lots')).toBeNaN();
    expect(wholeOrBlank(' ')).toBeNull();
    expect(wholeOrBlank('12')).toBe(12);
    expect(wholeOrBlank('1.5')).toBeNaN();
  });
});

describe('routeProblem', () => {
  it('needs a name and destination, valid numbers and a real date', () => {
    expect(routeProblem({ ...BLANK_ROUTE })).toBe('need_route');
    expect(routeProblem(route({ pay: 'x' }))).toBe('bad_number');
    expect(routeProblem(route({ months: '1.5' }))).toBe('bad_number');
    expect(routeProblem(route({ sourceDate: '2026-02-30' }))).toBe('bad_date');
    expect(routeProblem(route({ name: 'A'.repeat(121) }))).toBe('too_long');
    expect(routeProblem(route({}))).toBeNull();
  });

  it('market data must name its source and date', () => {
    expect(routeProblem(route({ source: 'market' }))).toBe('market_needs_source');
    expect(routeProblem(route({ source: 'market', sourceName: 'ONS' }))).toBe('market_needs_source');
    expect(routeProblem(route({ source: 'market', sourceName: 'ONS', sourceDate: '2026-04-01' }))).toBeNull();
  });
});

describe('buildScenarioOptions', () => {
  it('sends every field, unknowns as null, skipping blank rows', () => {
    const out = buildScenarioOptions([
      route({ name: ' Stay ', destination: ' London ' }),
      { ...BLANK_ROUTE },
      route({ name: 'Move', destination: 'Leeds', pay: '45000', cost: '3000', months: '6', source: 'estimate', uncertainty: 'high', requirements: ' Licence ', locationProfileId: 'loc1', skillReportId: 'rep1' }),
    ]);
    expect(out).toEqual({
      ok: true,
      options: [
        { name: 'Stay', destination: 'London', costCents: null, months: null, wageCents: null, source: 'user', sourceName: null, sourceDate: null, uncertainty: 'unknown', requirements: null, locationProfileId: null, skillReportId: null },
        { name: 'Move', destination: 'Leeds', costCents: 300_000, months: 6, wageCents: 4_500_000, source: 'estimate', sourceName: null, sourceDate: null, uncertainty: 'high', requirements: 'Licence', locationProfileId: 'loc1', skillReportId: 'rep1' },
      ],
    });
  });

  it('refuses with the row of the first problem', () => {
    expect(buildScenarioOptions([{ ...BLANK_ROUTE }])).toMatchObject({ ok: false, index: null });
    expect(buildScenarioOptions([route({}), route({ pay: 'lots' })])).toMatchObject({ ok: false, index: 1, message: expect.stringContaining('Route 2') });
    expect(buildScenarioOptions([route({ destination: '' })])).toMatchObject({ ok: false, index: 0 });
  });

  it('signature follows the inputs and title', () => {
    const a = buildScenarioOptions([route({})]);
    const b = buildScenarioOptions([route({ pay: '1' })]);
    if (!a.ok || !b.ok) throw new Error('expected ok');
    expect(scenarioSignature(a.options)).not.toBe(scenarioSignature(b.options));
    expect(scenarioSignature(a.options, 'x')).not.toBe(scenarioSignature(a.options, 'y'));
    expect(scenarioSignature(a.options, ' x ')).toBe(scenarioSignature(a.options, 'x'));
  });
});

describe('reopening a saved comparison', () => {
  it('turns cents back into whole units and round-trips', () => {
    const input = routeToInput(route({ pay: '55000', cost: '1200.5', months: '3', source: 'market', sourceName: 'ONS', sourceDate: '2026-04-01', uncertainty: 'low' }));
    const drafts = resultToDrafts({ options: [{ ...input, wageLabel: 'market_data', sourceName: 'ONS', sourceDate: '2026-04-01', uncertainty: 'low', requirements: null, locationProfileId: null, skillReportId: null }] });
    expect(drafts[0]).toMatchObject({ pay: '55000', cost: '1200.5', months: '3', source: 'market', sourceName: 'ONS', sourceDate: '2026-04-01', uncertainty: 'low' });
    expect(routeToInput(drafts[0])).toEqual(input);
    expect(resultToDrafts({ options: [] })).toHaveLength(1);
  });
});

describe('labels', () => {
  it('confirms the charge with the balance before and after', () => {
    expect(confirmBody(null)).toMatch(/one scenario report/);
    expect(confirmBody(3)).toMatch(/3 left; 2 after/);
    expect(confirmBody(0)).toMatch(/0 after/);
  });

  it('shows unknown amounts as unknown, never 0', () => {
    expect(amountLabel(null)).toBe('Pay unknown');
    expect(amountLabel(5_500_000)).toBe('55,000');
    expect(monthsLabel(null)).toBe('Pay unknown');
    expect(monthsLabel(6)).toBe('6');
    expect(payLabel({ wageCents: null })).toBe('Pay unknown');
    expect(payLabel({ wageCents: 4500000 })).toBe('Pay you entered: 45,000.00');
  });

  it('names sources, certainty and where a wage came from', () => {
    expect(sourceLabel('market')).toBe('Published market data');
    expect(uncertaintyLabel('unknown')).toBe('Not stated');
    expect(wageLabelText('user_supplied')).toBe('Your figure');
    expect(wageLabelText('unknown')).toBe('Unknown');
  });
});

describe('errors', () => {
  it('maps refusals of a paid comparison', () => {
    expect(scenarioErrorMessage(new ApiError(503, 'provider_unavailable', { code: 'provider_unavailable' }))).toBe(PROVIDER_UNAVAILABLE_MESSAGE);
    expect(scenarioErrorMessage(new ApiError(402, 'capacity_exceeded', { code: 'capacity_exceeded' }))).toMatch(/used up/);
    expect(scenarioErrorMessage(new ApiError(400, 'validation_error', { code: 'validation_error' }))).toMatch(/No credit was used/);
    expect(scenarioErrorMessage(new Error('x'))).toMatch(/not created/);
  });

  it('maps refusals of a free edit or delete', () => {
    expect(savedScenarioErrorMessage(new ApiError(404, 'not_found', { code: 'not_found' }))).toMatch(/no longer exists/);
    expect(savedScenarioErrorMessage(new ApiError(400, 'validation_error', { code: 'validation_error' }))).toMatch(/Nothing was changed/);
    expect(savedScenarioErrorMessage(new Error('x'))).toMatch(/not saved/);
  });
});
