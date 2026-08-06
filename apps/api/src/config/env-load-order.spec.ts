import { ConfigModule } from '@nestjs/config';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Pins WHEN `.env` reaches `process.env`, and whether it can override a real
 * environment variable.
 *
 * Both questions decide where a secret actually comes from at runtime, and both
 * are easy to get wrong by reading the code: `ConfigModule.forRoot()` is an
 * `async` method, which looks like it defers — but everything up to its first
 * `await` runs synchronously at call time, and the env-file load is in that
 * prefix. Since `forRoot()` is invoked while the `@Module` decorator on
 * AppModule is evaluated — i.e. when main.ts imports it — `process.env` is
 * already populated before `bootstrap()` executes a single line.
 *
 * I asserted the opposite while diagnosing a Stripe webhook failure. This test
 * exists so nobody has to take either claim on trust.
 */
describe('ConfigModule env loading', () => {
  const dir = mkdtempSync(join(tmpdir(), 'flacron-env-'));
  const envPath = join(dir, '.env');

  const KEY_ONLY_IN_FILE = 'FLACRON_PROBE_FILE_ONLY';
  const KEY_ALSO_IN_ENV = 'FLACRON_PROBE_BOTH';

  beforeAll(() => {
    writeFileSync(
      envPath,
      `${KEY_ONLY_IN_FILE}=from_dotenv\n${KEY_ALSO_IN_ENV}=from_dotenv\n`,
      'utf8',
    );
  });

  afterEach(() => {
    delete process.env[KEY_ONLY_IN_FILE];
    delete process.env[KEY_ALSO_IN_ENV];
  });

  it('populates process.env synchronously, before the returned promise is awaited', () => {
    expect(process.env[KEY_ONLY_IN_FILE]).toBeUndefined();

    // Deliberately NOT awaited. If loading were deferred, the assertion below
    // would fail — and `validateEnv()` running before NestFactory.create really
    // would be reading an unpopulated environment.
    const pending = ConfigModule.forRoot({ envFilePath: envPath, ignoreEnvVars: false });

    expect(process.env[KEY_ONLY_IN_FILE]).toBe('from_dotenv');

    return pending; // settle it so Jest does not warn about an open promise
  });

  it('does NOT override a variable that already exists in process.env', async () => {
    // This is the precedence rule that makes an OS/shell variable silently win
    // over the .env file an engineer is editing — the failure mode that sends
    // people hunting through application code for a bug that is not there.
    process.env[KEY_ALSO_IN_ENV] = 'from_os_environment';

    await ConfigModule.forRoot({ envFilePath: envPath, ignoreEnvVars: false });

    expect(process.env[KEY_ALSO_IN_ENV]).toBe('from_os_environment');
    expect(process.env[KEY_ALSO_IN_ENV]).not.toBe('from_dotenv');
  });
});
