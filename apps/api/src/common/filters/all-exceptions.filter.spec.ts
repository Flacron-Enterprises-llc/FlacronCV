import { ArgumentsHost, HttpException, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

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

  it('forwards AI refund codes on the 503 body', () => {
    const { host, json, status } = mockHost();
    filter.catch(
      new ServiceUnavailableException({
        message: 'AI generation failed',
        code: 'AI_CREDIT_REFUNDED',
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 503,
        message: 'AI generation failed',
        code: 'AI_CREDIT_REFUNDED',
      }),
    );
  });

  it('forwards AI_CREDIT_NOT_REFUNDED the same way', () => {
    const { host, json } = mockHost();
    filter.catch(
      new ServiceUnavailableException({
        message: 'AI generation failed',
        code: 'AI_CREDIT_NOT_REFUNDED',
      }),
      host,
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'AI generation failed',
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
});
