import { OpenAIProvider, openAIModelOrDefault } from './openai.provider';

describe('OPENAI_MODEL', () => {
  it('keeps gpt-4o-mini unless a well-formed model id is configured', () => {
    expect(openAIModelOrDefault(undefined)).toBe('gpt-4o-mini');
    expect(openAIModelOrDefault('')).toBe('gpt-4o-mini');
    expect(openAIModelOrDefault('not a model!')).toBe('gpt-4o-mini');
    expect(openAIModelOrDefault(' gpt-6-luna ')).toBe('gpt-6-luna');
  });

  it('the provider reads openai.model from configuration', () => {
    const config = { get: (key: string) => ({ 'openai.apiKey': undefined, 'openai.model': 'gpt-6-luna' })[key] };
    expect(new OpenAIProvider(config as never).defaultModel).toBe('gpt-6-luna');
    const unset = { get: () => undefined };
    expect(new OpenAIProvider(unset as never).defaultModel).toBe('gpt-4o-mini');
  });
});
