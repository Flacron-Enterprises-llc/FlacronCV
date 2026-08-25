import { describe, it, expect } from 'vitest';
import { ATS_CV_CHECKER, ATS_CV_CHECKER_PATH } from './ats-cv-checker';

describe('ATS_CV_CHECKER copy module', () => {
  it('holds unique landing strings, not a CV-page reuse', () => {
    expect(Object.keys(ATS_CV_CHECKER)).toHaveLength(21);
    expect(ATS_CV_CHECKER_PATH).toBe('/ats-cv-checker');
  });
});
