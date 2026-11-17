import { ArgumentsHost, HttpException, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { AllExceptionsFilter, redactSecrets } from './all-exceptions.filter';

function mockHost(url = '/api/v1/ai/cover-letter') {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'POST', url }),
    }),
  } as unknown as ArgumentsHost;
  return { host, json, status };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('never logs Stripe keys (even masked), webhook secrets or bearer tokens', () => {
    const errorSpy = jest.spyOn((filter as unknown as { logger: { error: (...a: unknown[]) => void } }).logger, 'error').mockImplementation(() => undefined);
    const { host, json } = mockHost('/api/v1/career-billing/capacity/checkout');
    const err = new Error('Invalid API Key provided: rk_test_*****************LKEY; sig whsec_abc123; Bearer eyJhbGciOi.x.y');
    filter.catch(err, host);
    const logged = errorSpy.mock.calls.flat().map(String).join(' ');
    expect(logged).not.toMatch(/rk_test_|whsec_|eyJhbGciOi/);
    expect(logged).toContain('[redacted-stripe-key]');
    // The client never sees internal details either.
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500, message: 'Internal server error' }));
    errorSpy.mockRestore();
  });

  it('redactSecrets covers live/test, secret/restricted/publishable keys', () => {
    expect(redactSecrets('a sk_live_ABC b rk_test_XYZ c pk_test_Q d')).toBe('a [redacted-stripe-key] b [redacted-stripe-key] c [redacted-stripe-key] d');
    expect(redactSecrets('no secrets here')).toBe('no secrets here');
    // Stripe's permission errors mask with dots ("rk_test_...B2DP"); found in a real test-mode run.
    expect(redactSecrets("The provided key 'rk_test_...B2DP' does not have")).toBe("The provided key '[redacted-stripe-key]' does not have");
    expect(redactSecrets('key rk_test_****ABCD.')).not.toMatch(/ABCD/);
  });

  it('forwards AI refund codes on the 503 body', () => {
    const { host, json, status } = mockHost();
    filter.catch(
      new ServiceUnavailableException({
        message: 'Flacron Engine generation failed',
        code: 'AI_CREDIT_REFUNDED',
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 503,
        message: 'Flacron Engine generation failed',
        code: 'AI_CREDIT_REFUNDED',
      }),
    );
  });

  it('forwards AI_CREDIT_NOT_REFUNDED the same way', () => {
    const { host, json } = mockHost();
    filter.catch(
      new ServiceUnavailableException({
        message: 'Flacron Engine generation failed',
        code: 'AI_CREDIT_NOT_REFUNDED',
      }),
      host,
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Flacron Engine generation failed',
        code: 'AI_CREDIT_NOT_REFUNDED',
      }),
    );
  });

  it('omits code when the exception has none', () => {
    const { host, json } = mockHost('/api/v1/cvs');
    filter.catch(new HttpException('Upgrade required', HttpStatus.FORBIDDEN), host);

    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toMatchObject({ success: false, statusCode: 403, message: 'Upgrade required' });
    expect(body).not.toHaveProperty('code');
  });

  it('passes the plain detail fields of a coded refusal (minimumPlan, limit), never nested data or envelope overrides', () => {
    const { host, json } = mockHost('/api/v1/payments/career/checkout');
    filter.catch(
      new HttpException(
        {
          code: 'UPGRADE_REQUIRED',
          message: 'Upgrade your plan to buy this add-on.',
          minimumPlan: 'professional',
          limit: 5,
          allowed: ['starter', 'professional'],
          internal: { stripeCustomer: 'cus_secret' },
          statusCode: 200,
          path: '/spoofed',
        },
        HttpStatus.FORBIDDEN,
      ),
      host,
    );
    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toMatchObject({
      statusCode: 403,
      code: 'UPGRADE_REQUIRED',
      minimumPlan: 'professional',
      limit: 5,
      allowed: ['starter', 'professional'],
      path: '/api/v1/payments/career/checkout',
    });
    expect(body).not.toHaveProperty('internal');
  });

  it('adds no detail fields to a body without a code (e.g. validation errors)', () => {
    const { host, json } = mockHost('/api/v1/cvs');
    filter.catch(new HttpException({ message: ['title must be a string'], error: 'Bad Request', extra: 'x' }, 400), host);
    expect(json.mock.calls[0][0]).not.toHaveProperty('extra');
  });
});
