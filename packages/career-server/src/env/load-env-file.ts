import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';

const WORKSPACE_MARKER = 'pnpm-workspace.yaml';

/**
 * Inside FlacronCV V1 the career service reads its own file, never V1's
 * `apps/api/.env` or a root `.env`, so V1 production credentials cannot be
 * picked up by accident. The file is git-ignored; `.env.career.example` lists the names.
 */
export const CAREER_ENV_FILE = '.env.career';

/**
 * Walks up from `startDir` until a directory holds `pnpm-workspace.yaml`.
 * Returns null when no such directory exists, for example in a deployed
 * image that ships only `dist`.
 */
export function findRepoRoot(startDir: string): string | null {
  let dir = startDir;
  for (;;) {
    if (existsSync(join(dir, WORKSPACE_MARKER))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Loads the repository-root `.env.career`. Works from `src`, `dist`, `scripts`,
 * and `test`, because it searches for the workspace marker instead of
 * counting `..` segments. Returns the file path that was read, or null.
 */
export function loadRepoEnv(startDir: string = __dirname): string | null {
  const root = findRepoRoot(startDir);
  if (root === null) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`Repository root (${WORKSPACE_MARKER}) was not found above ${startDir}. ${CAREER_ENV_FILE} was not loaded.`);
    }
    return null;
  }
  const envPath = join(root, CAREER_ENV_FILE);
  return loadEnvFile(envPath) ? envPath : null;
}

/**
 * Loads a .env file. A variable already set in the process environment
 * is left as it is. Values from the file are never written to the console.
 * A missing file is not an error: configuration may come from the process
 * environment (CI, containers), and each required variable is checked, by
 * name, where it is read.
 */
export function loadEnvFile(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  const text = readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
  return true;
}
