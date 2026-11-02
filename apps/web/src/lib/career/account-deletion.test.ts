import { describe, expect, it, vi } from 'vitest';
import { ApiError, type ApiClient } from '@flacroncv/career-api-client';
import { CareerErasureNeedsFreshSignIn, eraseCareerDataBeforeAccountDeletion } from './account-deletion';

const token = async () => 'fresh-token';
const client = (deleteAccount: ApiClient['deleteAccount']) => ({ deleteAccount }) as unknown as ApiClient;

describe('career erasure before V1 account deletion', () => {
  it('does nothing when the career integration is off', async () => {
    const deleteAccount = vi.fn();
    expect(await eraseCareerDataBeforeAccountDeletion(client(deleteAccount), false, token)).toBe('disabled');
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('erases with a fresh token and the confirmation word', async () => {
    const deleteAccount = vi.fn(async () => ({ deleted: true as const }));
    expect(await eraseCareerDataBeforeAccountDeletion(client(deleteAccount), true, token)).toBe('erased');
    expect(deleteAccount).toHaveBeenCalledWith({ idToken: 'fresh-token', confirm: 'DELETE' });
  });

  it('treats no career data as nothing to do', async () => {
    const deleteAccount = vi.fn(async () => {
      throw new ApiError(404, 'not_found', { code: 'not_found' });
    });
    expect(await eraseCareerDataBeforeAccountDeletion(client(deleteAccount), true, token)).toBe('none');
  });

  it('stops V1 deletion when the sign-in is too old, so the person can retry at once', async () => {
    const deleteAccount = vi.fn(async () => {
      throw new ApiError(400, 'validation_error', { code: 'validation_error', reason: 'stale' });
    });
    await expect(eraseCareerDataBeforeAccountDeletion(client(deleteAccount), true, token)).rejects.toBeInstanceOf(CareerErasureNeedsFreshSignIn);
  });

  it('defers to the closure sweep when the career service fails', async () => {
    const deleteAccount = vi.fn(async () => {
      throw new ApiError(503, 'provider_unavailable', { code: 'provider_unavailable' });
    });
    expect(await eraseCareerDataBeforeAccountDeletion(client(deleteAccount), true, token)).toBe('deferred');
  });
});
