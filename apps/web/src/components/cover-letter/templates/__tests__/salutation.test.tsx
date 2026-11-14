import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import type { CoverLetter } from '@flacroncv/shared-types';
import en from '../../../../../public/locales/en/common.json';
import ar from '../../../../../public/locales/ar/common.json';
import ur from '../../../../../public/locales/ur/common.json';
import { buildCoverLetterLabels } from '../../letter-locale';
import { Salutation } from '../parts';

const letter = (recipientName: string) => ({ recipientName }) as CoverLetter;
const text = (messages: Record<string, unknown>, name: string) =>
  render(<Salutation coverLetter={letter(name)} labels={buildCoverLetterLabels(messages)} />).container.textContent;

describe('Salutation comma', () => {
  it('Arabic and Urdu letters end the salutation with the Arabic comma', () => {
    expect(text(ar.coverLetters, '')).toBe(`${ar.coverLetters.cl_dear} ${ar.coverLetters.cl_hiring_manager}،`);
    expect(text(ur.coverLetters, 'Amara')).toBe(`${ur.coverLetters.cl_dear} Amara،`);
  });

  it('English keeps the Latin comma', () => {
    expect(text(en.coverLetters, 'Amara')).toBe('Dear Amara,');
  });
});
