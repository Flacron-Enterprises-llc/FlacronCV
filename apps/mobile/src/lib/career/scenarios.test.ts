import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import { PROVIDER_UNAVAILABLE_MESSAGE } from './action-packs';
import {
  addRoute,
  BLANK_ROUTE,
  buildScenarioOptions,
  FIRST_ROUTE,
  MAX_ROUTES,
  payLabel,
  removeRoute,
  scenarioErrorMessage,
  scenarioSignature,
  updateRoute,
} from './scenarios';

describe('routes', () => {
  it('adds up to three and never removes the last one', () => {
    let routes = [FIRST_ROUTE];
    routes = addRoute(addRoute(addRoute(routes)));
    expect(routes).toHaveLength(MAX_ROUTES);
    expect(removeRoute([FIRST_ROUTE], 0)).toHaveLength(1);
    expect(removeRoute(routes, 0)).toHaveLength(2);
    expect(updateRoute(routes, 1, { name: 'Move' })[1].name).toBe('Move');
  });
});

describe('buildScenarioOptions', () => {
  it('sends what the website sends: trimmed, cost 0, 12 months, source user, blank pay unknown', () => {
    const out = buildScenarioOptions([
      { name: ' Stay ', destination: ' London ', wage: '' },
      { ...BLANK_ROUTE },
      { name: 'Move', destination: 'Leeds', wage: '4500000' },
    ]);
    expect(out).toEqual({
      ok: true,
      options: [
        { name: 'Stay', destination: 'London', costCents: 0, months: 12, wageCents: null, source: 'user' },
        { name: 'Move', destination: 'Leeds', costCents: 0, months: 12, wageCents: 4500000, source: 'user' },
      ],
    });
  });

  it('refuses when no route is complete or pay is not whole cents', () => {
    expect(buildScenarioOptions([{ ...BLANK_ROUTE }])).toMatchObject({ ok: false, index: null });
    expect(buildScenarioOptions([{ name: 'A', destination: 'B', wage: '12.50' }])).toMatchObject({ ok: false, index: 0 });
    expect(buildScenarioOptions([{ name: 'A', destination: 'B', wage: 'lots' }])).toMatchObject({ ok: false, index: 0 });
    expect(buildScenarioOptions([{ name: 'A'.repeat(121), destination: 'B', wage: '' }])).toMatchObject({ ok: false, index: 0 });
  });

  it('signature follows the inputs', () => {
    const a = buildScenarioOptions([FIRST_ROUTE]);
    const b = buildScenarioOptions([{ ...FIRST_ROUTE, wage: '1' }]);
    if (!a.ok || !b.ok) throw new Error('expected ok');
    expect(scenarioSignature(a.options)).not.toBe(scenarioSignature(b.options));
  });
});

describe('result and errors', () => {
  it('labels pay', () => {
    expect(payLabel({ wageCents: null })).toBe('Pay unknown');
    expect(payLabel({ wageCents: 4500000 })).toBe('Pay you entered: 45,000.00');
  });

  it('maps refusals', () => {
    expect(scenarioErrorMessage(new ApiError(503, 'provider_unavailable', { code: 'provider_unavailable' }))).toBe(PROVIDER_UNAVAILABLE_MESSAGE);
    expect(scenarioErrorMessage(new ApiError(402, 'capacity_exceeded', { code: 'capacity_exceeded' }))).toMatch(/used up/);
    expect(scenarioErrorMessage(new ApiError(400, 'validation_error', { code: 'validation_error' }))).toMatch(/No credit was used/);
    expect(scenarioErrorMessage(new Error('x'))).toMatch(/not created/);
  });
});
