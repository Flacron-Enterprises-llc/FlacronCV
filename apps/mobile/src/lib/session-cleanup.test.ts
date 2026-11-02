import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { careerDrafts } from '../store/career-drafts';
import { clearAccountCaches } from './session-cleanup';

describe('clearAccountCaches', () => {
  it('drops cached account data and unsaved career edits', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['cvs', 1, 10], { items: [{ id: 'cv-of-account-a' }] });
    queryClient.setQueryData(['user'], { uid: 'a' });
    careerDrafts.set('a', 'writing:1', { body: 'private draft' });

    clearAccountCaches({ queryClient, careerDrafts });

    expect(queryClient.getQueryData(['cvs', 1, 10])).toBeUndefined();
    expect(queryClient.getQueryData(['user'])).toBeUndefined();
    expect(careerDrafts.get('a', 'writing:1')).toBeUndefined();
  });
});
