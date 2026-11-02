import { createSignInDeleter, IdentityToolkitSignInDeleter, RetainedByV1SignInDeleter, UnconfiguredSignInDeleter } from './sign-in-deleter';

/** No network: a fake fetch stands in for Identity Toolkit. */
function fakeFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; body: string }> = [];
  const fn = async (url: string, init: { body: string }) => {
    calls.push({ url, body: init.body });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fn, calls };
}

describe('V2 sign-in deletion', () => {
  it('never targets FlacronCV V1\'s Firebase project', () => {
    expect(() => new IdentityToolkitSignInDeleter('flacron-cv', 'key')).toThrow(/V2 project/);
  });

  it('inside V1 never deletes the sign-in, whatever the configuration (V1 owns it)', async () => {
    const configurations: NodeJS.ProcessEnv[] = [
      {},
      { FIREBASE_PROJECT_ID: 'flacron-cv', FIREBASE_WEB_API_KEY: 'key' },
      { FIREBASE_PROJECT_ID: 'demo-flacroncv', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' },
      { FIREBASE_PROJECT_ID: 'flacroncv-v2-prod', FIREBASE_WEB_API_KEY: 'k' },
    ];
    for (const env of configurations) {
      const deleter = createSignInDeleter(env);
      expect(deleter).toBeInstanceOf(RetainedByV1SignInDeleter);
      expect(deleter).not.toBeInstanceOf(IdentityToolkitSignInDeleter);
      expect(deleter).not.toBeInstanceOf(UnconfiguredSignInDeleter);
      await expect(deleter.deleteSignIn('token')).resolves.toBeUndefined();
    }
  });

  it('deletes only the account the token belongs to, and treats an already-deleted account as done', async () => {
    const ok = fakeFetch(200, {});
    await new IdentityToolkitSignInDeleter('flacroncv-v2-prod', 'web-key', 'https://idt.example.test', ok.fn).deleteSignIn('tok');
    expect(ok.calls).toEqual([{ url: 'https://idt.example.test/v1/accounts:delete?key=web-key', body: JSON.stringify({ idToken: 'tok' }) }]);

    const gone = fakeFetch(400, { error: { message: 'USER_NOT_FOUND' } });
    await expect(new IdentityToolkitSignInDeleter('p', 'k', 'https://x', gone.fn).deleteSignIn('tok')).resolves.toBeUndefined();
  });

  it('reports a stale token as stale, and anything else as unavailable, without echoing values', async () => {
    const stale = fakeFetch(400, { error: { message: 'CREDENTIAL_TOO_OLD_LOGIN_AGAIN' } });
    await expect(new IdentityToolkitSignInDeleter('p', 'k', 'https://x', stale.fn).deleteSignIn('tok')).rejects.toMatchObject({
      code: 'validation_error',
      details: { reason: 'stale' },
    });
    const down = fakeFetch(500, { error: { message: 'INTERNAL tok' } });
    await expect(new IdentityToolkitSignInDeleter('p', 'k', 'https://x', down.fn).deleteSignIn('tok')).rejects.toMatchObject({
      code: 'provider_unavailable',
      details: { reason: 'sign_in_deletion_failed' },
    });
    const throws = async () => {
      throw new Error('network tok');
    };
    await expect(new IdentityToolkitSignInDeleter('p', 'k', 'https://x', throws).deleteSignIn('tok')).rejects.toMatchObject({
      code: 'provider_unavailable',
    });
  });
});
