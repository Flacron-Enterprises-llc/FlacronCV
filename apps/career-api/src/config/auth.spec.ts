import { readAuthConfig } from './auth';

describe('readAuthConfig', () => {
  it('uses the Auth emulator in development, with a demo- project by default', () => {
    expect(readAuthConfig({ NODE_ENV: 'development', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' })).toEqual({
      mode: 'emulator',
      projectId: 'demo-flacroncv',
    });
  });

  it('fails in development when the emulator host is missing', () => {
    expect(() => readAuthConfig({ NODE_ENV: 'development', FIREBASE_PROJECT_ID: 'demo-x' })).toThrow(
      /FIREBASE_AUTH_EMULATOR_HOST/,
    );
  });

  it('refuses a real project id outside production and does not print it', () => {
    const run = () =>
      readAuthConfig({ NODE_ENV: 'development', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIREBASE_PROJECT_ID: 'flacroncv-prod-123' });
    expect(run).toThrow(/must start with demo-/);
    expect(run).not.toThrow(/flacroncv-prod-123/);
  });

  it('needs the project id in production and refuses the emulator there', () => {
    expect(readAuthConfig({ NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'flacron-cv' })).toEqual({
      mode: 'firebase',
      projectId: 'flacron-cv',
    });
    expect(() => readAuthConfig({ NODE_ENV: 'production' })).toThrow(/FIREBASE_PROJECT_ID/);
    expect(() =>
      readAuthConfig({ NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'flacron-cv', FIREBASE_AUTH_EMULATOR_HOST: 'x:1' }),
    ).toThrow(/must not be set/);
  });

  it('accepts only FlacronCV V1\'s project in production, so there is one customer identity', () => {
    expect(() => readAuthConfig({ NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'flacroncv-v2-prod' })).toThrow(/V1/);
    expect(() => readAuthConfig({ NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'real-project' })).toThrow(/V1/);
  });

  it('never lets development reach V1\'s live project', () => {
    expect(() =>
      readAuthConfig({ NODE_ENV: 'development', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIREBASE_PROJECT_ID: 'flacron-cv' }),
    ).toThrow(/demo-/);
  });

  it('accepts no token in tests unless the emulator is set', () => {
    expect(readAuthConfig({ NODE_ENV: 'test' })).toEqual({ mode: 'unconfigured' });
  });
});
