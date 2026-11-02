import { V1_FIREBASE_PROJECT_ID } from '@flacroncv/career-server';

export type AuthConfig =
  | { mode: 'firebase'; projectId: string }
  | { mode: 'emulator'; projectId: string }
  | { mode: 'unconfigured' };

const DEFAULT_EMULATOR_PROJECT = 'demo-flacroncv';

/**
 * How the API checks ID tokens (decision 1, BUILD_PLAN P4):
 *
 * - production: signed tokens from V1's Firebase project only. The career
 *   service is part of FlacronCV V1, which owns the customer identity.
 *   `FIREBASE_PROJECT_ID` must name that project and the emulator host is refused.
 * - development: the Auth emulator only. Boot fails without
 *   `FIREBASE_AUTH_EMULATOR_HOST`. The project id must start with `demo-`,
 *   Firebase's prefix for a project that cannot reach production.
 * - anything else (tests): the emulator when its host is set, otherwise no
 *   token is accepted. Tests bind a fake verifier.
 *
 * Messages name variables, never values.
 */
export function readAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  const nodeEnv = env.NODE_ENV?.trim() || 'development';
  const emulatorHost = env.FIREBASE_AUTH_EMULATOR_HOST?.trim() ?? '';
  const projectId = env.FIREBASE_PROJECT_ID?.trim() ?? '';

  if (nodeEnv === 'production') {
    if (emulatorHost.length > 0) {
      throw new Error('FIREBASE_AUTH_EMULATOR_HOST must not be set while NODE_ENV is production');
    }
    if (projectId.length === 0) throw new Error('Missing required environment variable: FIREBASE_PROJECT_ID');
    // One customer identity, V1's. Any other project would create a second, unrelated account.
    if (projectId !== V1_FIREBASE_PROJECT_ID) throw new Error('FIREBASE_PROJECT_ID must be FlacronCV V1\'s project in production');
    return { mode: 'firebase', projectId };
  }

  if (emulatorHost.length === 0) {
    if (nodeEnv === 'development') {
      throw new Error('Missing required environment variable: FIREBASE_AUTH_EMULATOR_HOST (development uses the Auth emulator only)');
    }
    return { mode: 'unconfigured' };
  }
  const emulatorProject = projectId.length > 0 ? projectId : DEFAULT_EMULATOR_PROJECT;
  if (!emulatorProject.startsWith('demo-')) {
    throw new Error('FIREBASE_PROJECT_ID must start with demo- outside production, so the emulator cannot reach a real project');
  }
  return { mode: 'emulator', projectId: emulatorProject };
}
