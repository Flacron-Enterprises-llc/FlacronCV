import type { Provider } from '@nestjs/common';
import { createTextModel } from '@flacroncv/career-server';
import type { TextModel } from '@flacroncv/career-server';

export const TEXT_MODEL = Symbol('TEXT_MODEL');

/**
 * `AI_PROVIDER=openai` plus `OPENAI_API_KEY` binds OpenAI. Tests override
 * this with `FakeTextModel`. Empty env stays unconfigured.
 */
export const aiProviders: Provider[] = [
  {
    provide: TEXT_MODEL,
    useFactory: (): TextModel => createTextModel(process.env),
  },
];
