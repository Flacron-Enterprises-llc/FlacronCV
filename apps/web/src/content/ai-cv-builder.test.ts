import { describe, it, expect } from 'vitest';
import { AI_CV_BUILDER, AI_CV_BUILDER_PATH } from './ai-cv-builder';

describe('AI_CV_BUILDER copy module', () => {
  it('holds unique landing strings, not a homepage reuse', () => {
    expect(Object.keys(AI_CV_BUILDER)).toHaveLength(26);
    expect(AI_CV_BUILDER_PATH).toBe('/ai-cv-builder');
  });
});
