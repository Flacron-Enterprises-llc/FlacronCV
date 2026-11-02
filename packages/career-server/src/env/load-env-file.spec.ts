import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { findRepoRoot, loadEnvFile, loadRepoEnv } from './load-env-file';

describe('findRepoRoot', () => {
  it('finds the flacroncv-v2 root from src/env', () => {
    const root = findRepoRoot(__dirname);
    expect(root).toBe(resolve(__dirname, '../../../..'));
  });

  it('returns null when no workspace marker exists above the start', () => {
    const dir = mkdtempSync(join(tmpdir(), 'no-root-'));
    try {
      expect(findRepoRoot(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('loadRepoEnv', () => {
  let repo: string;
  const keys = ['FLACRONCV_TEST_FROM_FILE', 'FLACRONCV_TEST_ALREADY_SET', 'FLACRONCV_TEST_QUOTED'];

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'repo-'));
    writeFileSync(join(repo, 'pnpm-workspace.yaml'), 'packages: []\n');
    writeFileSync(
      join(repo, '.env.career'),
      [
        '# comment',
        'FLACRONCV_TEST_FROM_FILE=from-file',
        'FLACRONCV_TEST_ALREADY_SET=from-file',
        'FLACRONCV_TEST_QUOTED="quoted value"',
        'not a pair',
      ].join('\r\n'),
    );
    for (const key of keys) delete process.env[key];
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
    for (const key of keys) delete process.env[key];
  });

  it('ignores a plain .env, where V1 keeps its own (production) settings', () => {
    rmSync(join(repo, '.env.career'));
    writeFileSync(join(repo, '.env'), 'FLACRONCV_TEST_FROM_FILE=v1-file\n');
    const start = join(repo, 'apps', 'career-api', 'src');
    mkdirSync(start, { recursive: true });

    expect(loadRepoEnv(start)).toBeNull();
    expect(process.env.FLACRONCV_TEST_FROM_FILE).toBeUndefined();
  });

  it.each([
    ['src', join('apps', 'api', 'src', 'config')],
    ['dist', join('apps', 'api', 'dist', 'config')],
    ['scripts', join('apps', 'api', 'scripts')],
    ['test', join('apps', 'api', 'test')],
  ])('loads the root .env.career when started from %s', (_label, relative) => {
    const start = join(repo, relative);
    mkdirSync(start, { recursive: true });

    expect(loadRepoEnv(start)).toBe(join(repo, '.env.career'));
    expect(process.env.FLACRONCV_TEST_FROM_FILE).toBe('from-file');
    expect(process.env.FLACRONCV_TEST_QUOTED).toBe('quoted value');
  });

  it('keeps a value that the process environment already has', () => {
    process.env.FLACRONCV_TEST_ALREADY_SET = 'from-process';
    loadRepoEnv(repo);
    expect(process.env.FLACRONCV_TEST_ALREADY_SET).toBe('from-process');
  });

  it('keeps an empty value that the process environment already has', () => {
    process.env.FLACRONCV_TEST_ALREADY_SET = '';
    loadRepoEnv(repo);
    expect(process.env.FLACRONCV_TEST_ALREADY_SET).toBe('');
  });

  it('treats a missing file as optional: no throw, no output, environment untouched', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      process.env.FLACRONCV_TEST_ALREADY_SET = 'from-process';
      expect(loadEnvFile(join(repo, 'missing.env'))).toBe(false);
      rmSync(join(repo, '.env.career'));
      expect(loadRepoEnv(repo)).toBeNull();
      expect(error).not.toHaveBeenCalled();
      expect(process.env.FLACRONCV_TEST_ALREADY_SET).toBe('from-process');
      expect(process.env.FLACRONCV_TEST_FROM_FILE).toBeUndefined();
    } finally {
      error.mockRestore();
    }
  });
});
