import { ConsoleLogger } from '@nestjs/common';
import { redactSecrets } from '../filters/all-exceptions.filter';

/**
 * The API's logger: Nest's ConsoleLogger with every message, context and stack
 * passed through redactSecrets first. Stripe error messages echo masked keys
 * ("rk_test_...ABCD"), and many services log `err.message` directly, so the
 * scrubbing has to happen at the logger, not at each call site.
 */
export class RedactingLogger extends ConsoleLogger {
  private static scrub(values: unknown[]): unknown[] {
    return values.map((v) => (typeof v === 'string' ? redactSecrets(v) : v instanceof Error ? redactSecrets(v.stack ?? v.message) : v));
  }

  log(message: unknown, ...rest: unknown[]) {
    super.log(...(RedactingLogger.scrub([message, ...rest]) as [unknown, ...unknown[]]));
  }

  error(message: unknown, ...rest: unknown[]) {
    super.error(...(RedactingLogger.scrub([message, ...rest]) as [unknown, ...unknown[]]));
  }

  warn(message: unknown, ...rest: unknown[]) {
    super.warn(...(RedactingLogger.scrub([message, ...rest]) as [unknown, ...unknown[]]));
  }

  debug(message: unknown, ...rest: unknown[]) {
    super.debug(...(RedactingLogger.scrub([message, ...rest]) as [unknown, ...unknown[]]));
  }

  verbose(message: unknown, ...rest: unknown[]) {
    super.verbose(...(RedactingLogger.scrub([message, ...rest]) as [unknown, ...unknown[]]));
  }

  fatal(message: unknown, ...rest: unknown[]) {
    super.fatal(...(RedactingLogger.scrub([message, ...rest]) as [unknown, ...unknown[]]));
  }
}
