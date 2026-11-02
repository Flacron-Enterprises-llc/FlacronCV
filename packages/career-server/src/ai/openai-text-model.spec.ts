import { BillingError } from '../billing/errors';
import { createTextModel } from './create-text-model';
import { OpenAITextModel } from './openai-text-model';
import { UnconfiguredTextModel } from './text-model';

describe('OpenAITextModel', () => {
  const request = { template: 'resume-compose@1', system: 'Return one JSON object.', prompt: 'ids', maxTokens: 80, temperature: 0 };

  it('sends the prompt and returns the model text', async () => {
    const fetchImpl = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ model: 'gpt-4o-mini', choices: [{ message: { content: '{"templateId":"classic","factIds":[]}' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const model = new OpenAITextModel('sk-test', 'gpt-4o-mini', fetchImpl as typeof fetch);
    const result = await model.complete(request);
    expect(result).toEqual({
      text: '{"templateId":"classic","factIds":[]}',
      provider: 'openai',
      model: 'gpt-4o-mini',
    });
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as { response_format?: { type: string } };
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('maps a provider failure without echoing the body', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchImpl = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('secret', { status: 401 }));
    const model = new OpenAITextModel('sk-test', 'gpt-4o-mini', fetchImpl as typeof fetch);
    const error = await model.complete(request).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BillingError);
    if (error instanceof BillingError) {
      expect(error.code).toBe('provider_unavailable');
      expect(error.details).toMatchObject({ reason: 'http_401' });
      expect(JSON.stringify(error)).not.toContain('secret');
    }
    expect(warn).toHaveBeenCalledWith('OpenAITextModel request failed with HTTP 401');
    warn.mockRestore();
  });
});

describe('createTextModel', () => {
  it('stays unconfigured without an explicit openai provider', () => {
    expect(createTextModel({ OPENAI_API_KEY: 'sk-test' })).toBeInstanceOf(UnconfiguredTextModel);
    expect(createTextModel({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test' })).toBeInstanceOf(OpenAITextModel);
  });
});
