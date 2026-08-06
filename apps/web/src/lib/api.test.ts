import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted runs before vi.mock hoisting, so the variable is available in the factory
const { mockCurrentUser } = vi.hoisted(() => {
  const mockCurrentUser: { currentUser: { getIdToken: () => Promise<string> } | null } = {
    currentUser: null,
  };
  return { mockCurrentUser };
});

// Mock the firebase module that api.ts depends on
vi.mock('./firebase', () => ({
  auth: mockCurrentUser,
}));

// Import api AFTER mocks are set up
import { api, ApiError } from './api';

describe('api lib', () => {
  beforeEach(() => {
    mockCurrentUser.currentUser = null;
    vi.stubGlobal('fetch', vi.fn());
  });

  function makeFetchResponse(
    body: unknown,
    ok = true,
    contentLength: string | null = null,
  ) {
    return Promise.resolve({
      ok,
      status: ok ? 200 : 404,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'content-length' ? contentLength : null,
      },
      json: () => Promise.resolve(body),
    } as unknown as Response);
  }

  it('sends GET request without auth header when no user is logged in', async () => {
    mockCurrentUser.currentUser = null;
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      makeFetchResponse({ data: { items: [] } }),
    );

    await api.get('/test');

    const [, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = (opts as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('injects Authorization header when user is logged in', async () => {
    mockCurrentUser.currentUser = {
      getIdToken: vi.fn().mockResolvedValue('my-id-token'),
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      makeFetchResponse({ data: { id: 1 } }),
    );

    await api.get('/protected');

    const [, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = (opts as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer my-id-token');
  });

  it('POST sends JSON body', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      makeFetchResponse({ data: { created: true } }),
    );

    await api.post('/items', { name: 'Test' });

    const [, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((opts as RequestInit).method).toBe('POST');
    expect((opts as RequestInit).body).toBe(JSON.stringify({ name: 'Test' }));
  });

  it('throws Error with server message on non-ok response', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      makeFetchResponse({ message: 'Not found' }, false),
    );

    await expect(api.get('/missing')).rejects.toThrow('Not found');
  });

  it('unwraps data envelope — returns data.data when present', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      makeFetchResponse({ success: true, data: { id: 42 }, timestamp: '2024-01-01' }),
    );

    const result = await api.get<{ id: number }>('/wrapped');
    expect(result).toEqual({ id: 42 });
  });

  it('returns response body directly when no data envelope', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      makeFetchResponse({ id: 99, name: 'raw' }),
    );

    const result = await api.get<{ id: number; name: string }>('/raw');
    expect(result).toEqual({ id: 99, name: 'raw' });
  });

  describe('error classification', () => {
    /** Reject the next fetch() with an error carrying the given `name`. */
    function rejectWith(name: string) {
      const err = new Error('boom');
      err.name = name;
      (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(Promise.reject(err));
    }

    it('classifies an abort as a retryable timeout while online', async () => {
      vi.stubGlobal('navigator', { onLine: true });
      rejectWith('TimeoutError');

      const err = await api.get('/slow').catch((e) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect(err.kind).toBe('timeout');
      expect(err.retryable).toBe(true);
      // The old copy was a bare "the server did not respond".
      expect(err.message).toMatch(/longer than expected/i);
    });

    it('classifies an abort as offline when the device has no connection', async () => {
      vi.stubGlobal('navigator', { onLine: false });
      rejectWith('AbortError');

      const err = await api.get('/slow').catch((e) => e);
      expect(err.kind).toBe('offline');
      expect(err.message).toMatch(/offline/i);
    });

    it('classifies a fetch TypeError as a network error', async () => {
      vi.stubGlobal('navigator', { onLine: true });
      rejectWith('TypeError');

      const err = await api.get('/unreachable').catch((e) => e);
      expect(err.kind).toBe('network');
      expect(err.retryable).toBe(true);
    });

    it('marks 5xx retryable and 4xx not retryable', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
        Promise.resolve({
          ok: false,
          status: 503,
          headers: { get: () => null },
          json: () => Promise.resolve({ message: 'Service unavailable' }),
        } as unknown as Response),
      );
      const serverErr = await api.get('/down').catch((e) => e);
      expect(serverErr.status).toBe(503);
      expect(serverErr.retryable).toBe(true);

      (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
        Promise.resolve({
          ok: false,
          status: 403,
          headers: { get: () => null },
          json: () => Promise.resolve({ message: 'Upgrade required' }),
        } as unknown as Response),
      );
      const clientErr = await api.get('/forbidden').catch((e) => e);
      expect(clientErr.message).toBe('Upgrade required');
      expect(clientErr.retryable).toBe(false);
    });

    it('falls back to a status-bearing message when the body has none', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
        Promise.resolve({
          ok: false,
          status: 500,
          headers: { get: () => null },
          json: () => Promise.reject(new Error('not json')),
        } as unknown as Response),
      );
      await expect(api.get('/broken')).rejects.toThrow('HTTP 500');
    });
  });

  it('proceeds without auth header when token fetch fails', async () => {
    mockCurrentUser.currentUser = {
      getIdToken: vi.fn().mockRejectedValue(new Error('token fetch failed')),
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      makeFetchResponse({ data: {} }),
    );

    await api.get('/fallback');

    const [, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = (opts as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });
});
