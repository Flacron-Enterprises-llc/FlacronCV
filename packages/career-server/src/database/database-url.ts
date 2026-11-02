const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * True when the URL host is this machine. Throws without the value when
 * the URL cannot be parsed.
 */
export function isLocalDatabaseUrl(databaseUrl: string): boolean {
  let host: string;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    throw new Error('DATABASE_URL could not be parsed. The value was not printed.');
  }
  return LOCAL_HOSTS.has(host);
}

/**
 * Reads `DATABASE_URL` for the API and the worker. Outside production the
 * database must be on this machine. In production a local host is refused,
 * so a misconfigured deploy does not run against an empty local database.
 * Error messages never include the value.
 */
export function readDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const databaseUrl = env.DATABASE_URL?.trim() ?? '';
  if (databaseUrl.length === 0) {
    throw new Error('Missing required environment variable: DATABASE_URL');
  }
  const production = (env.NODE_ENV?.trim() || 'development') === 'production';
  const local = isLocalDatabaseUrl(databaseUrl);
  if (production && local) {
    throw new Error('DATABASE_URL points at a local host while NODE_ENV is production');
  }
  if (!production && !local) {
    throw new Error('DATABASE_URL must point at localhost or 127.0.0.1 outside production');
  }
  return databaseUrl;
}

/**
 * Removes the connection string and its password from text that may be
 * printed, such as a driver error message.
 */
export function redactDatabaseUrl(text: string, databaseUrl: string | undefined): string {
  if (!databaseUrl) return text;
  let out = text.split(databaseUrl).join('[redacted]');
  let password = '';
  try {
    password = new URL(databaseUrl).password;
  } catch {
    return out;
  }
  if (password.length > 0) {
    out = out.split(password).join('[redacted]');
    let decoded = password;
    try {
      decoded = decodeURIComponent(password);
    } catch {
      decoded = password;
    }
    out = out.split(decoded).join('[redacted]');
  }
  return out;
}
