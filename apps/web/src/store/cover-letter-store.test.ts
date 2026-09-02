import { describe, it, expect, beforeEach } from 'vitest';
import { CoverLetterStatus } from '@flacroncv/shared-types';
import type { CoverLetter } from '@flacroncv/shared-types';
import { useCoverLetterStore } from './cover-letter-store';

function makeLetter(overrides: Partial<CoverLetter> = {}): CoverLetter {
  return {
    id: 'cl-1',
    userId: 'user-1',
    title: 'Letter',
    recipientName: '',
    recipientTitle: '',
    companyName: '',
    companyAddress: '',
    jobTitle: '',
    jobDescription: '',
    content: '<p>Hello</p>',
    templateId: 'modern',
    styling: {
      fontFamily: 'Inter',
      fontSize: 'medium',
      primaryColor: '#000000',
    },
    aiGenerated: false,
    aiProvider: null,
    linkedCVId: null,
    status: CoverLetterStatus.DRAFT,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

describe('cover-letter-store', () => {
  beforeEach(() => {
    useCoverLetterStore.getState().reset();
  });

  it('setContent marks dirty', () => {
    useCoverLetterStore.getState().setCoverLetter(makeLetter());
    useCoverLetterStore.getState().setContent('<p>Edited</p>');
    expect(useCoverLetterStore.getState().isDirty).toBe(true);
  });

  it('markSaved clears dirty when the store still holds the snapshot', () => {
    const letter = makeLetter();
    useCoverLetterStore.getState().setCoverLetter(letter);
    useCoverLetterStore.getState().setContent('<p>Saved body</p>');
    const snapshot = useCoverLetterStore.getState().coverLetter;
    useCoverLetterStore.getState().markSaved(snapshot);
    expect(useCoverLetterStore.getState().isDirty).toBe(false);
    expect(useCoverLetterStore.getState().lastSavedAt).toBeInstanceOf(Date);
  });

  it('markSaved keeps dirty when content changed during the save', () => {
    useCoverLetterStore.getState().setCoverLetter(makeLetter());
    useCoverLetterStore.getState().setContent('<p>First</p>');
    const snapshot = useCoverLetterStore.getState().coverLetter;
    useCoverLetterStore.getState().setContent('<p>Typed during save</p>');
    useCoverLetterStore.getState().markSaved(snapshot);
    expect(useCoverLetterStore.getState().isDirty).toBe(true);
    expect(useCoverLetterStore.getState().coverLetter?.content).toBe('<p>Typed during save</p>');
  });
});
