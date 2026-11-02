import { OpenAITextModel, textModelOrDefault } from './openai-text-model';
import { UnconfiguredTextModel, type TextModel } from './text-model';

/**
 * `AI_PROVIDER=openai` plus `OPENAI_API_KEY` binds the live adapter.
 * Anything else stays unconfigured so tests and empty env never call out.
 * `OPENAI_TEXT_MODEL` picks the chat model (default 'gpt-4o-mini'; OpenAI lists
 * its only snapshot for shutdown on 14 Jan 2027).
 */
export function createTextModel(env: NodeJS.ProcessEnv = process.env): TextModel {
  const provider = env.AI_PROVIDER?.trim().toLowerCase() ?? '';
  const key = env.OPENAI_API_KEY?.trim() ?? '';
  if (provider === 'openai' && key.length > 0) return new OpenAITextModel(key, textModelOrDefault(env.OPENAI_TEXT_MODEL));
  return new UnconfiguredTextModel();
}
