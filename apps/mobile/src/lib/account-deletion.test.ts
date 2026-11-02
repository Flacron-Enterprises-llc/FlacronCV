import { describe, expect, it } from 'vitest';
import { ApiError, type ApiClient } from '../../../../packages/career-api-client/src/client';
import { CareerErasureNeedsFreshSignIn, deleteAccountEverywhere } from './account-deletion';

function harness(careerDelete: () => Promise<unknown>) {
  const calls: string[] = [];
  const careerApi = {
    deleteAccount: async (input: { idToken: string; confirm: string }) => {
      calls.push(`career:${input.confirm}`);
      return careerDelete();
    },
  } as unknown as ApiClient;
  return {
    calls,
    deps: {
      careerEnabled: true,
      careerApi,
      freshIdToken: async () => 'fresh-token',
      deleteV1Account: async () => {
        calls.push('v1');
      },
      signOutLocally: async () => {
        calls.push('signout');
      },
    },
  };
}

describe('deleteAccountEverywhere', () => {
  it('erases career data, then deletes the V1 account, then signs out', async () => {
    const h = harness(async () => ({ ok: true }));
    await expect(deleteAccountEverywhere(h.deps)).resolves.toBe('erased');
    expect(h.calls).toEqual(['career:DELETE', 'v1', 'signout']);
  });

  it('a stale sign-in stops everything before V1 is touched', async () => {
    const h = harness(async () => {
      throw new ApiError(400, 'validation_error', { code: 'validation_error', reason: 'stale' });
    });
    await expect(deleteAccountEverywhere(h.deps)).rejects.toBeInstanceOf(CareerErasureNeedsFreshSignIn);
    expect(h.calls).toEqual(['career:DELETE']);
  });

  it('an unreachable career service defers to the closure sweep and V1 deletion still happens', async () => {
    const h = harness(async () => {
      throw new ApiError(0, 'network_error', { code: 'network_error' });
    });
    await expect(deleteAccountEverywhere(h.deps)).resolves.toBe('deferred');
    expect(h.calls).toEqual(['career:DELETE', 'v1', 'signout']);
  });

  it('without career tools in the build, it is exactly V1 deletion', async () => {
    const h = harness(async () => ({ ok: true }));
    await expect(deleteAccountEverywhere({ ...h.deps, careerEnabled: false })).resolves.toBe('disabled');
    expect(h.calls).toEqual(['v1', 'signout']);
  });

  it('if V1 deletion fails the person stays signed in and the error surfaces', async () => {
    const h = harness(async () => ({ ok: true }));
    await expect(
      deleteAccountEverywhere({
        ...h.deps,
        deleteV1Account: async () => {
          throw new Error('offline');
        },
      }),
    ).rejects.toThrow('offline');
    expect(h.calls).toEqual(['career:DELETE']);
  });
});
