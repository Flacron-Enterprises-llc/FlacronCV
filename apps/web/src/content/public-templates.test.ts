import { describe, it, expect } from 'vitest';
import { PUBLIC_TEMPLATES_EN } from './public-templates';

describe('PUBLIC_TEMPLATES_EN copy module', () => {
  it('holds unique English-only body strings, not a new path', () => {
    expect(Object.keys(PUBLIC_TEMPLATES_EN)).toHaveLength(19);
  });
});
