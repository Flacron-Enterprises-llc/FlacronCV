import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { AIService } from './ai.service';

function makeProvider(overrides: Record<string, unknown> = {}) {
  return {
    name: 'openai',
    isAvailable: jest.fn().mockResolvedValue(true),
    generateText: jest.fn().mockResolvedValue({
      content: 'ok',
      provider: 'openai',
      model: 'gpt-4o-mini',
      tokensUsed: 10,
      latencyMs: 5,
    }),
    ...overrides,
  };
}

// The AI service now delegates the credit gate to an atomic reserve/refund on
// UsersService, so the double just controls whether a reservation succeeds.
function makeUsers({ reserve = true } = {}) {
  return {
    reserveAiCredit: jest.fn().mockResolvedValue(reserve),
    refundAiCredit: jest.fn().mockResolvedValue(undefined),
  };
}

describe('AIService ATS check metering', () => {
  const abuse = { assertNewConsumption: jest.fn().mockResolvedValue(undefined) } as any;

  it('spends a résumé analysis, not a document credit', async () => {
    const users = { ...makeUsers(), reserveAnalysis: jest.fn().mockResolvedValue({ ok: true, counter: 'analyses' }), refundUsage: jest.fn() };
    const service = new AIService(makeProvider() as any, users as any, abuse);
    await service.atsCheck('cv', 'jd', 'u1');
    expect(users.reserveAnalysis).toHaveBeenCalledWith('u1');
    expect(users.reserveAiCredit).not.toHaveBeenCalled();
  });

  it('refunds the analysis when generation fails', async () => {
    const users = { ...makeUsers(), reserveAnalysis: jest.fn().mockResolvedValue({ ok: true, counter: 'analyses' }), refundUsage: jest.fn() };
    const provider = makeProvider({ generateText: jest.fn().mockRejectedValue(new Error('down')) });
    const service = new AIService(provider as any, users as any, abuse);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await expect(service.atsCheck('cv', 'jd', 'u1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(users.refundUsage).toHaveBeenCalledWith('u1', 'analyses');
    expect(users.refundAiCredit).not.toHaveBeenCalled();
  });

  it('answers ANALYSES_EXHAUSTED when none are left; a legacy plan keeps the credit message', async () => {
    const exhausted = { ...makeUsers(), reserveAnalysis: jest.fn().mockResolvedValue({ ok: false, counter: 'analyses' }) };
    const err: any = await new AIService(makeProvider() as any, exhausted as any, abuse).atsCheck('cv', 'jd', 'u1').catch((e) => e);
    expect(err.getResponse()).toMatchObject({ code: 'ANALYSES_EXHAUSTED' });

    const legacy = { ...makeUsers(), reserveAnalysis: jest.fn().mockResolvedValue({ ok: false, counter: 'aiCredits' }) };
    const err2: any = await new AIService(makeProvider() as any, legacy as any, abuse).atsCheck('cv', 'jd', 'u1').catch((e) => e);
    expect(err2.message).toBe('Flacron Engine credits exhausted. Please upgrade your plan.');
  });

  it('writing features still spend a document credit', async () => {
    const users = { ...makeUsers(), reserveAnalysis: jest.fn() };
    const service = new AIService(makeProvider() as any, users as any, abuse);
    await service.linkedinOptimize('cv', 'role', 'u1');
    await service.interviewPrep('jd', 'cv', 'u1');
    expect(users.reserveAiCredit).toHaveBeenCalledTimes(2);
    expect(users.reserveAnalysis).not.toHaveBeenCalled();
  });
});

const httpError = (status: number) => Object.assign(new Error(`status ${status}`), { status });

describe('AIService', () => {
  describe('option clamping (cost + circuit-breaker DoS guard)', () => {
    it('clamps maxTokens to the server ceiling + temperature to [0,2] and never forwards a caller-supplied model', async () => {
      const provider = makeProvider();
      const service = new AIService(provider as any, makeUsers() as any, {
        assertNewConsumption: jest.fn().mockResolvedValue(undefined),
      } as any);

      await service.generate('hi', { maxTokens: 999999, temperature: 5, model: 'gpt-4o' } as any, 'u1');

      expect(provider.generateText).toHaveBeenCalledTimes(1);
      // Exact-equality proves no `model` key leaks through.
      expect(provider.generateText.mock.calls[0][1]).toEqual({ maxTokens: 2048, temperature: 2 });
    });

    it('floors out-of-range values (temperature < 0 → 0, maxTokens < 1 → 1)', async () => {
      const provider = makeProvider();
      const service = new AIService(provider as any, makeUsers() as any, {
        assertNewConsumption: jest.fn().mockResolvedValue(undefined),
      } as any);

      await service.generate('hi', { maxTokens: 0, temperature: -3 } as any, 'u1');

      expect(provider.generateText.mock.calls[0][1]).toEqual({ maxTokens: 1, temperature: 0 });
    });

    it('falls back to defaults when params are absent or non-numeric', async () => {
      const provider = makeProvider();
      const service = new AIService(provider as any, makeUsers() as any, {
        assertNewConsumption: jest.fn().mockResolvedValue(undefined),
      } as any);

      await service.generate('hi', {}, 'u1');

      expect(provider.generateText.mock.calls[0][1]).toEqual({ maxTokens: 1024, temperature: 0.7 });
    });
  });

  describe('circuit breaker', () => {
    it('does NOT open on repeated 4xx client-input errors (prevents cross-tenant DoS)', async () => {
      const provider = makeProvider({ generateText: jest.fn().mockRejectedValue(httpError(400)) });
      const service = new AIService(provider as any, makeUsers() as any, {
        assertNewConsumption: jest.fn().mockResolvedValue(undefined),
      } as any);

      for (let i = 0; i < 4; i++) {
        await expect(service.generate('hi', {}, 'u1')).rejects.toThrow(ServiceUnavailableException);
      }
      // Breaker stayed closed → the provider was attempted on every call incl. the 4th.
      expect(provider.generateText).toHaveBeenCalledTimes(4);
    });

    it('does not echo the provider error into the client 503 message', async () => {
      const provider = makeProvider({ generateText: jest.fn().mockRejectedValue(httpError(400)) });
      const service = new AIService(provider as any, makeUsers() as any, {
        assertNewConsumption: jest.fn().mockResolvedValue(undefined),
      } as any);

      await expect(service.generate('hi', {}, 'u1')).rejects.toMatchObject({
        message: 'Flacron Engine generation failed',
      });
    });

    it('DOES open after 3 genuine provider (5xx) failures', async () => {
      const provider = makeProvider({ generateText: jest.fn().mockRejectedValue(httpError(500)) });
      const service = new AIService(provider as any, makeUsers() as any, {
        assertNewConsumption: jest.fn().mockResolvedValue(undefined),
      } as any);

      for (let i = 0; i < 4; i++) {
        await expect(service.generate('hi', {}, 'u1')).rejects.toThrow(ServiceUnavailableException);
      }
      // Breaker opened after the 3rd failure → 4th call short-circuits, provider not called.
      expect(provider.generateText).toHaveBeenCalledTimes(3);
    });
  });

  describe('credit gate (atomic reserve / refund)', () => {
    it('rejects when the reservation fails (no credit), without calling the paid provider', async () => {
      const provider = makeProvider();
      const users = makeUsers({ reserve: false });
      const service = new AIService(provider as any, users as any, {
        assertNewConsumption: jest.fn().mockResolvedValue(undefined),
      } as any);

      await expect(service.generate('hi', {}, 'u1')).rejects.toThrow(
        'Flacron Engine credits exhausted. Please upgrade your plan.',
      );
      expect(provider.generateText).not.toHaveBeenCalled();
      expect(users.refundAiCredit).not.toHaveBeenCalled();
    });

    it('reserves before the call and does NOT refund on success', async () => {
      const provider = makeProvider();
      const users = makeUsers();
      const service = new AIService(provider as any, users as any, {
        assertNewConsumption: jest.fn().mockResolvedValue(undefined),
      } as any);

      await service.generate('hi', {}, 'u1');

      expect(users.reserveAiCredit).toHaveBeenCalledWith('u1');
      expect(users.refundAiCredit).not.toHaveBeenCalled();
    });

    it('refunds the reserved credit when generation fails (a failed generation costs nothing)', async () => {
      const provider = makeProvider({ generateText: jest.fn().mockRejectedValue(httpError(500)) });
      const users = makeUsers();
      const service = new AIService(provider as any, users as any, {
        assertNewConsumption: jest.fn().mockResolvedValue(undefined),
      } as any);

      const err = await service.generate('hi', {}, 'u1').catch((e) => e);
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect(err.getResponse()).toMatchObject({
        message: 'Flacron Engine generation failed',
        code: 'AI_CREDIT_REFUNDED',
      });
      expect(users.reserveAiCredit).toHaveBeenCalledWith('u1');
      expect(users.refundAiCredit).toHaveBeenCalledTimes(1);
    });

    it('retries the refund twice and still reports REFUNDED if a later attempt succeeds', async () => {
      const provider = makeProvider({ generateText: jest.fn().mockRejectedValue(httpError(500)) });
      const users = makeUsers();
      users.refundAiCredit
        .mockRejectedValueOnce(new Error('unavailable'))
        .mockRejectedValueOnce(new Error('unavailable'))
        .mockResolvedValueOnce(undefined);
      const service = new AIService(provider as any, users as any, {
        assertNewConsumption: jest.fn().mockResolvedValue(undefined),
      } as any);

      const err = await service.generate('hi', {}, 'u1').catch((e) => e);
      expect(err.getResponse()).toMatchObject({ code: 'AI_CREDIT_REFUNDED' });
      expect(users.refundAiCredit).toHaveBeenCalledTimes(3);
    });

    it('reports NOT_REFUNDED after three failed attempts and logs the grep line once', async () => {
      const provider = makeProvider({ generateText: jest.fn().mockRejectedValue(httpError(500)) });
      const users = makeUsers();
      users.refundAiCredit.mockRejectedValue(new Error('firestore unavailable'));
      const service = new AIService(provider as any, users as any, {
        assertNewConsumption: jest.fn().mockResolvedValue(undefined),
      } as any);
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      try {
        const err = await service.generate('hi', {}, 'u1').catch((e) => e);
        expect(err.getResponse()).toMatchObject({
          message: 'Flacron Engine generation failed',
          code: 'AI_CREDIT_NOT_REFUNDED',
        });
        expect(users.refundAiCredit).toHaveBeenCalledTimes(3);
        expect(errorSpy).toHaveBeenCalledWith('Failed to refund AI credit for u1: firestore unavailable');
      } finally {
        errorSpy.mockRestore();
      }
    });
  });
});
