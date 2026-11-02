import { readAppConfig } from './env';

describe('readAppConfig', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  function setEnv(values: Record<string, string | undefined>) {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  it('refuses a missing DATABASE_URL and names the variable', () => {
    setEnv({ DATABASE_URL: undefined, NODE_ENV: 'development' });
    expect(() => readAppConfig()).toThrow('Missing required environment variable: DATABASE_URL');
  });

  it('refuses a blank DATABASE_URL', () => {
    setEnv({ DATABASE_URL: '   ', NODE_ENV: 'development' });
    expect(() => readAppConfig()).toThrow('Missing required environment variable: DATABASE_URL');
  });

  it('refuses a remote database outside production without printing the value', () => {
    setEnv({ DATABASE_URL: 'postgresql://u:secret-pw@db.example.com:5432/x', NODE_ENV: 'development' });
    expect(() => readAppConfig()).toThrow(/must point at localhost/);
    try {
      readAppConfig();
    } catch (error) {
      expect(String(error)).not.toContain('secret-pw');
      expect(String(error)).not.toContain('db.example.com');
    }
  });

  it('refuses a local database in production', () => {
    setEnv({
      DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/x',
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://flacroncv.com',
    });
    expect(() => readAppConfig()).toThrow(/local host while NODE_ENV is production/);
  });

  it('refuses to boot in development without the Auth emulator host', () => {
    setEnv({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/x',
      NODE_ENV: 'development',
      FIREBASE_AUTH_EMULATOR_HOST: undefined,
    });
    expect(() => readAppConfig()).toThrow('Missing required environment variable: FIREBASE_AUTH_EMULATOR_HOST');
  });

  it('accepts a local database in development and defaults the port', () => {
    setEnv({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/x',
      NODE_ENV: 'development',
      PORT: undefined,
      CORS_ORIGINS: undefined,
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      FIREBASE_PROJECT_ID: undefined,
    });
    expect(readAppConfig()).toEqual({
      nodeEnv: 'development',
      port: 4001,
      corsOrigins: [
        'http://localhost:3001',
        'http://127.0.0.1:3001',
        'http://localhost:3012',
        'http://127.0.0.1:3012',
      ],
    });
  });

  it('refuses an unparseable DATABASE_URL without printing it', () => {
    setEnv({ DATABASE_URL: 'not a url secret-pw', NODE_ENV: 'development' });
    expect(() => readAppConfig()).toThrow('DATABASE_URL could not be parsed. The value was not printed.');
  });
});
