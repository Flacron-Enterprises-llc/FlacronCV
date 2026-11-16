import { describe, expect, it, vi } from 'vitest';
import { PLAN_ORDER } from '../../../../packages/career-shared/src/catalog';
import * as mobile from './plan-catalog';

// The website's plan catalog imports the shared catalog through its workspace
// alias; point that alias at the same source file the app reads.
vi.mock('@flacroncv/career-shared', async () => import('../../../../packages/career-shared/src/index'));

/** Loaded at test time so the app bundle never includes website code. */
async function webCatalog(): Promise<typeof import('../../../web/src/components/pricing/plan-catalog')> {
  return import('../../../web/src/components/pricing/plan-catalog');
}

describe('feature states: app and website say the same thing', () => {
  it('has the same feature-state map and comparison rows', async () => {
    const web = await webCatalog();
    expect(mobile.FEATURE_STATE).toEqual(web.FEATURE_STATE);
    expect([...mobile.COMPARISON_ROWS]).toEqual([...web.COMPARISON_ROWS]);
  });

  it('gives every row and every plan cell the same state, with the career tools on and off', async () => {
    const web = await webCatalog();
    for (const careerEnabled of [true, false]) {
      for (const row of web.COMPARISON_ROWS) {
        expect([row, careerEnabled, mobile.featureState(row, careerEnabled)]).toEqual([row, careerEnabled, web.featureState(row, careerEnabled)]);
        for (const plan of PLAN_ORDER) {
          expect([row, plan, careerEnabled, mobile.cellState(row, plan, careerEnabled)]).toEqual([
            row,
            plan,
            careerEnabled,
            web.cellState(row, plan, careerEnabled),
          ]);
        }
      }
    }
  });
});
