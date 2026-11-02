import { BillingError } from '../billing/errors';

/**
 * Every AI call goes through this interface. Production plugs in a
 * provider adapter; tests use `FakeTextModel` (`src/testing`). Nothing in
 * `packages/server` calls a provider directly.
 */
export interface TextModelRequest {
  /** Which prompt template, for the fake and for provenance (`prompt_template_version`). */
  template: string;
  system: string;
  prompt: string;
  maxTokens: number;
  temperature: number;
}

export interface TextModelResponse {
  text: string;
  provider: string;
  model: string;
}

export interface TextModel {
  complete(request: TextModelRequest): Promise<TextModelResponse>;
}

/** No provider key yet. Every call is `provider_unavailable`, so nothing is charged or counted. */
export class UnconfiguredTextModel implements TextModel {
  async complete(): Promise<TextModelResponse> {
    throw new BillingError('provider_unavailable', { reason: 'ai_not_configured' });
  }
}

export const DEFAULT_MODEL_TIMEOUT_MS = 60_000;

/**
 * Runs one completion with a deadline. A provider error or a timeout
 * becomes `provider_unavailable`; the provider's message is not passed on
 * (it can echo the prompt, which holds personal data).
 */
export async function completeWithin(
  model: TextModel,
  request: TextModelRequest,
  timeoutMs: number = DEFAULT_MODEL_TIMEOUT_MS,
): Promise<TextModelResponse> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new BillingError('provider_unavailable', { reason: 'timeout' })), timeoutMs);
  });
  try {
    const response = await Promise.race([model.complete(request), deadline]);
    if (typeof response.text !== 'string' || response.text.trim().length === 0) {
      throw new BillingError('provider_unavailable', { reason: 'empty_output' });
    }
    return response;
  } catch (error) {
    if (error instanceof BillingError) throw error;
    throw new BillingError('provider_unavailable', { reason: 'provider_error' });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The JSON object in a model reply. Models wrap JSON in fences or add a
 * sentence; V1 `CvService.parseResumeSafe` sliced to the outer braces the
 * same way. Anything that is not an object is `null`.
 */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first === -1 || last <= first) return null;
  try {
    const parsed: unknown = JSON.parse(cleaned.slice(first, last + 1));
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
