import { describe, it, expect } from 'vitest';
import {
  AI_COVER_LETTER_GENERATOR,
  AI_COVER_LETTER_GENERATOR_PATH,
} from './ai-cover-letter-generator';

describe('AI_COVER_LETTER_GENERATOR copy module', () => {
  it('holds unique landing strings, not a CV-page reuse', () => {
    expect(Object.keys(AI_COVER_LETTER_GENERATOR)).toHaveLength(24);
    expect(AI_COVER_LETTER_GENERATOR_PATH).toBe('/ai-cover-letter-generator');
  });
});
