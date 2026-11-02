import { assertDeploySafety, readDatabaseUrl } from '@flacroncv/career-server';
import { readAuthConfig } from './auth';

export interface AppConfig {
  nodeEnv: string;
  port: number;
  corsOrigins: string[];
}

/**
 * Reads process env. Throws a message that names the missing variable.
 * Never includes a variable's value. The database rule is
 * `readDatabaseUrl`; the token rule is `readAuthConfig`.
 */
export function readAppConfig(): AppConfig {
  readDatabaseUrl(process.env);
  readAuthConfig(process.env);
  assertDeploySafety(process.env);
  const nodeEnv = process.env.NODE_ENV?.trim() || 'development';

  return {
    nodeEnv,
    port: readPort(process.env.PORT),
    corsOrigins: readCorsOrigins(nodeEnv),
  };
}

function readPort(value: string | undefined): number {
  const raw = value?.trim() ?? '';
  if (raw.length === 0) return 4001;
  if (!/^\d+$/.test(raw)) {
    throw new Error('PORT must be an integer from 1 to 65535');
  }
  const port = Number(raw);
  if (port < 1 || port > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535');
  }
  return port;
}

function readCorsOrigins(nodeEnv: string): string[] {
  const raw = process.env.CORS_ORIGINS?.trim() ?? '';
  if (raw.length > 0) {
    return raw
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
  }
  if (nodeEnv === 'production') {
    throw new Error('Missing required environment variable: CORS_ORIGINS');
  }
  return [
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:3012',
    'http://127.0.0.1:3012',
  ];
}
