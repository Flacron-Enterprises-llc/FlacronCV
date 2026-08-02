import { ServiceUnavailableException } from '@nestjs/common';
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

const httpError = (status: number) => Object.assign(new Error(`status ${status}`), { status });

describe('AIService', () => {
  describe('option clamping (cost + circuit-breaker DoS guard)', () => {
    it('clamps maxTokens to the server ceiling + temperature to [0,2] and never forwards a caller-supplied model', async () => {
      const provider = makeProvider();
      const service = new AIService(provider as any, makeUsers() as any);

      await service.generate('hi', { maxTokens: 999999, temperature: 5, model: 'gpt-4o' } as any, 'u1');

      expect(provider.generateText).toHaveBeenCalledTimes(1);
      // Exact-equality proves no `model` key leaks through.
      expect(provider.generateText.mock.calls[0][1]).toEqual({ maxTokens: 2048, temperature: 2 });
    });

    it('floors out-of-range values (temperature < 0 → 0, maxTokens < 1 → 1)', async () => {
      const provider = makeProvider();
      const service = new AIService(provider as any, makeUsers() as any);

      await service.generate('hi', { maxTokens: 0, temperature: -3 } as any, 'u1');

      expect(provider.generateText.mock.calls[0][1]).toEqual({ maxTokens: 1, temperature: 0 });
    });

    it('falls back to defaults when params are absent or non-numeric', async () => {
      const provider = makeProvider();
      const service = new AIService(provider as any, makeUsers() as any);

      await service.generate('hi', {}, 'u1');

      expect(provider.generateText.mock.calls[0][1]).toEqual({ maxTokens: 1024, temperature: 0.7 });
    });
  });

  describe('circuit breaker', () => {
    it('does NOT open on repeated 4xx client-input errors (prevents cross-tenant DoS)', async () => {
      const provider = makeProvider({ generateText: jest.fn().mockRejectedValue(httpError(400)) });
      const service = new AIService(provider as any, makeUsers() as any);

      for (let i = 0; i < 4; i++) {
        await expect(service.generate('hi', {}, 'u1')).rejects.toThrow(ServiceUnavailableException);
      }
      // Breaker stayed closed → the provider was attempted on every call incl. the 4th.
      expect(provider.generateText).toHaveBeenCalledTimes(4);
    });

    it('DOES open after 3 genuine provider (5xx) failures', async () => {
      const provider = makeProvider({ generateText: jest.fn().mockRejectedValue(httpError(500)) });
      const service = new AIService(provider as any, makeUsers() as any);

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
      const service = new AIService(provider as any, users as any);

      await expect(service.generate('hi', {}, 'u1')).rejects.toThrow(ServiceUnavailableException);
      expect(provider.generateText).not.toHaveBeenCalled();
      expect(users.refundAiCredit).not.toHaveBeenCalled();
    });

    it('reserves before the call and does NOT refund on success', async () => {
      const provider = makeProvider();
      const users = makeUsers();
      const service = new AIService(provider as any, users as any);

      await service.generate('hi', {}, 'u1');

      expect(users.reserveAiCredit).toHaveBeenCalledWith('u1');
      expect(users.refundAiCredit).not.toHaveBeenCalled();
    });

    it('refunds the reserved credit when generation fails (a failed generation costs nothing)', async () => {
      const provider = makeProvider({ generateText: jest.fn().mockRejectedValue(httpError(500)) });
      const users = makeUsers();
      const service = new AIService(provider as any, users as any);

      await expect(service.generate('hi', {}, 'u1')).rejects.toThrow(ServiceUnavailableException);
      expect(users.reserveAiCredit).toHaveBeenCalledWith('u1');
      expect(users.refundAiCredit).toHaveBeenCalledWith('u1');
    });
  });
});
