import { ConsoleLogger, Logger } from '@nestjs/common';
import { RedactingLogger } from './redacting-logger';

describe('RedactingLogger', () => {
  const captured: string[] = [];
  let outSpy: jest.SpyInstance;
  let errSpy: jest.SpyInstance;

  beforeEach(() => {
    captured.length = 0;
    const grab = (chunk: unknown) => {
      captured.push(String(chunk));
      return true;
    };
    outSpy = jest.spyOn(process.stdout, 'write').mockImplementation(grab as never);
    errSpy = jest.spyOn(process.stderr, 'write').mockImplementation(grab as never);
  });
  afterEach(() => {
    outSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('scrubs Stripe keys (masked with dots or stars), webhook secrets and bearer tokens from every level', () => {
    const logger = new RedactingLogger();
    const stripeMessage = "Permission denied. The provided key 'rk_test_...B2DP' does not have the required permissions";
    logger.log(`a sk_live_ABCdef123 b`, 'Ctx');
    logger.warn(`Trial eligibility check failed: ${stripeMessage}`, 'PaymentService');
    logger.error(`checkout failed: whsec_abc123`, `Error: ${stripeMessage}\n    at x (y.js:1:1)`, 'Filter');
    logger.debug('Bearer eyJhbGciOi.x.y');
    const all = captured.join('');
    expect(all).not.toMatch(/rk_test_|sk_live_|whsec_abc|eyJhbGciOi|B2DP/);
    expect(all).toContain('[redacted-stripe-key]');
  });

  it('is what Nest Logger instances use once installed', () => {
    Logger.overrideLogger(new RedactingLogger());
    new Logger('PaymentService').error("The provided key 'rk_test_...ZZZZ' does not have");
    expect(captured.join('')).not.toMatch(/ZZZZ/);
    Logger.overrideLogger(new ConsoleLogger());
  });
});
