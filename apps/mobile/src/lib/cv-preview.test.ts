import { describe, expect, it } from 'vitest';
import { PREVIEW_DEBOUNCE_MS, previewBody } from './cv-preview';

describe('previewBody', () => {
  it('sends only the fields the renderer reads, from the unsaved editor state', () => {
    const cv = { id: 'cv1', userId: 'u1', title: 'Mine', templateId: 'modern', styling: { primaryColor: '#123456' }, personalInfo: { firstName: 'Ada' } };
    const sections = [{ id: 's1', type: 'skills', items: [{ name: 'TS' }] }];
    expect(previewBody(cv, sections)).toEqual({ templateId: 'modern', styling: { primaryColor: '#123456' }, personalInfo: { firstName: 'Ada' }, sections });
    expect(Object.keys(previewBody(cv, sections))).not.toContain('userId');
  });

  it('works before the CV has loaded and debounces typing', () => {
    expect(previewBody(null, [])).toEqual({ templateId: undefined, styling: undefined, personalInfo: undefined, sections: [] });
    expect(PREVIEW_DEBOUNCE_MS).toBeGreaterThanOrEqual(300);
  });
});
