import { BillingError } from '../billing/errors';
import type { TextModel, TextModelRequest, TextModelResponse } from './text-model';

export const DEFAULT_MODEL = 'gpt-4o-mini';

/** A well-formed model id from configuration, else the default. */
export function textModelOrDefault(value: string | undefined | null): string {
  const v = value?.trim() ?? '';
  return /^[a-z0-9][a-z0-9._:-]{1,79}$/i.test(v) ? v : DEFAULT_MODEL;
}
const DEFAULT_TIMEOUT_MS = 40_000;

/**
 * OpenAI Chat Completions over HTTPS. The key is never logged. A missing
 * or empty reply is `provider_unavailable`, matching UnconfiguredTextModel.
 */
export class OpenAITextModel implements TextModel {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_MODEL,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {
    if (!apiKey.trim()) throw new Error('OpenAITextModel needs OPENAI_API_KEY');
  }

  async complete(request: TextModelRequest): Promise<TextModelResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.prompt },
          ],
          max_tokens: request.maxTokens,
          temperature: request.temperature,
          response_format: jsonObjectHint(request.system) ? { type: 'json_object' } : undefined,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        console.warn(`OpenAITextModel request failed with HTTP ${response.status}`);
        throw new BillingError('provider_unavailable', { reason: `http_${response.status}` });
      }
      const body = (await response.json()) as {
        model?: string;
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const text = body.choices?.[0]?.message?.content?.trim() ?? '';
      if (!text) throw new BillingError('provider_unavailable', { reason: 'empty_output' });
      return { text, provider: 'openai', model: body.model ?? this.model };
    } catch (error) {
      if (error instanceof BillingError) throw error;
      throw new BillingError('provider_unavailable', { reason: 'provider_error' });
    } finally {
      clearTimeout(timer);
    }
  }
}

function jsonObjectHint(system: string): boolean {
  return /json object/i.test(system);
}
