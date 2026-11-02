import { OpenAITextModel } from './openai-text-model';
import { UnconfiguredTextModel, type TextModel } from './text-model';

/**
 * `AI_PROVIDER=openai` plus `OPENAI_API_KEY` binds the live adapter.
 * Anything else stays unconfigured so tests and empty env never call out.
 */
export function createTextModel(env: NodeJS.ProcessEnv = process.env): TextModel {
  const provider = env.AI_PROVIDER?.trim().toLowerCase() ?? '';
  const key = env.OPENAI_API_KEY?.trim() ?? '';
  if (provider === 'openai' && key.length > 0) return new OpenAITextModel(key);
  return new UnconfiguredTextModel();
}
