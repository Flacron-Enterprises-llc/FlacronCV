import { describe, it, expect, beforeEach } from 'vitest';
import { useCVStore } from './cv-store';
import type { CV, CVSection } from '@flacroncv/shared-types';

function makeCV(overrides: Partial<CV> = {}): CV {
  return {
    id: 'cv-1',
    userId: 'user-1',
    title: 'My CV',
    templateId: 'modern',
    personalInfo: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: '',
      location: '',
      website: '',
      linkedin: '',
      github: '',
      summary: '',
    },
    styling: {
      primaryColor: '#000000',
      fontFamily: 'Inter',
      fontSize: 'medium',
      spacing: 'normal',
      showPhoto: false,
    },
    sectionOrder: ['s1'],
    isPublic: false,
    publicSlug: null,
    language: 'en',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CV;
}

function makeSection(id: string, overrides: Partial<CVSection> = {}): CVSection {
  return {
    id,
    cvId: 'cv-1',
    type: 'experience',
    title: `Section ${id}`,
    order: 0,
    isVisible: true,
    items: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CVSection;
}

describe('cv-store', () => {
  beforeEach(() => {
    useCVStore.getState().reset();
  });

  describe('setCV', () => {
    it('sets cv and marks isDirty=false', () => {
      const cv = makeCV();
      useCVStore.getState().setCV(cv);
      const state = useCVStore.getState();
      expect(state.cv).toEqual(cv);
      expect(state.isDirty).toBe(false);
    });
  });

  describe('updatePersonalInfo', () => {
    it('updates a field and sets isDirty=true', () => {
      useCVStore.getState().setCV(makeCV());
      useCVStore.getState().updatePersonalInfo('firstName', 'Jane');
      const state = useCVStore.getState();
      expect(state.cv!.personalInfo.firstName).toBe('Jane');
      expect(state.isDirty).toBe(true);
    });
  });

  describe('addSection', () => {
    it('adds section to sections array and sectionOrder', () => {
      const cv = makeCV({ sectionOrder: [] });
      useCVStore.getState().setCV(cv);
      const section = makeSection('new-s');
      useCVStore.getState().addSection(section);

      const state = useCVStore.getState();
      expect(state.sections).toContainEqual(section);
      expect(state.cv!.sectionOrder).toContain('new-s');
      expect(state.isDirty).toBe(true);
    });
  });

  describe('removeSection', () => {
    it('removes section from both sections and sectionOrder', () => {
      const cv = makeCV({ sectionOrder: ['s1', 's2'] });
      useCVStore.getState().setCV(cv);
      useCVStore.getState().setSections([makeSection('s1'), makeSection('s2')]);
      useCVStore.getState().removeSection('s1');

      const state = useCVStore.getState();
      expect(state.sections.find((s) => s.id === 's1')).toBeUndefined();
      expect(state.cv!.sectionOrder).not.toContain('s1');
      expect(state.cv!.sectionOrder).toContain('s2');
    });
  });

  describe('reorderSections', () => {
    it('reorders sections correctly', () => {
      const cv = makeCV({ sectionOrder: ['s1', 's2', 's3'] });
      useCVStore.getState().setCV(cv);
      useCVStore.getState().setSections([makeSection('s1'), makeSection('s2'), makeSection('s3')]);
      useCVStore.getState().reorderSections(['s3', 's1', 's2']);

      const state = useCVStore.getState();
      expect(state.cv!.sectionOrder).toEqual(['s3', 's1', 's2']);
      expect(state.sections[0].id).toBe('s3');
    });

    it('syncs each section order field to its new index so the reorder persists', () => {
      const cv = makeCV({ sectionOrder: ['s1', 's2', 's3'] });
      useCVStore.getState().setCV(cv);
      useCVStore.getState().setSections([makeSection('s1'), makeSection('s2'), makeSection('s3')]);
      useCVStore.getState().reorderSections(['s3', 's1', 's2']);

      const state = useCVStore.getState();
      // order must match position, or autosave would persist stale values and
      // getSections() would revert the editor list on reload.
      expect(state.sections.map((s) => [s.id, s.order])).toEqual([
        ['s3', 0],
        ['s1', 1],
        ['s2', 2],
      ]);
    });
  });

  describe('undo/redo', () => {
    it('undo reverts to previous state', () => {
      const cv = makeCV();
      useCVStore.getState().setCV(cv);
      useCVStore.getState().pushHistory(); // snapshot 0: firstName=John

      useCVStore.getState().updatePersonalInfo('firstName', 'Jane');
      useCVStore.getState().pushHistory(); // snapshot 1: firstName=Jane

      // undo from historyIndex=1 → historyIndex=0 → snapshot 0 = John
      useCVStore.getState().undo();

      expect(useCVStore.getState().cv!.personalInfo.firstName).toBe('John');
    });

    it('redo restores forward state', () => {
      const cv = makeCV();
      useCVStore.getState().setCV(cv);
      useCVStore.getState().pushHistory(); // snapshot 0

      useCVStore.getState().updatePersonalInfo('firstName', 'Jane');
      useCVStore.getState().pushHistory(); // snapshot 1

      useCVStore.getState().undo(); // back to snapshot 0
      useCVStore.getState().redo(); // forward to snapshot 1

      expect(useCVStore.getState().cv!.personalInfo.firstName).toBe('Jane');
    });

    it('new edit after undo truncates forward history', () => {
      const cv = makeCV();
      useCVStore.getState().setCV(cv);
      useCVStore.getState().pushHistory(); // 0: John

      useCVStore.getState().updatePersonalInfo('firstName', 'Jane');
      useCVStore.getState().pushHistory(); // 1: Jane

      useCVStore.getState().undo(); // back to 0: John

      // New edit after undo — forward history (Jane) should be discarded
      useCVStore.getState().updatePersonalInfo('firstName', 'Bob');
      useCVStore.getState().pushHistory(); // 1 (new): Bob

      expect(useCVStore.getState().canRedo()).toBe(false);
    });

    it('history is capped at 50 entries', () => {
      const cv = makeCV();
      useCVStore.getState().setCV(cv);

      for (let i = 0; i < 55; i++) {
        useCVStore.getState().pushHistory();
      }

      expect(useCVStore.getState().history.length).toBeLessThanOrEqual(50);
    });

    /**
     * Locks the snapshot ORDERING contract that CVEditor must follow.
     *
     * CVEditor used to call pushHistory() *before* each mutation, which stored
     * the pre-edit state. Two user-visible bugs followed: the first edit could
     * never be undone, and each later undo reverted two edits at once. These
     * tests fail if that ordering is reintroduced.
     */
    describe('snapshot ordering (push AFTER the mutation)', () => {
      it('the first edit is undoable when a baseline is seeded on load', () => {
        const cv = makeCV();
        useCVStore.getState().setCV(cv);
        useCVStore.getState().pushHistory(); // baseline, seeded by the editor page

        useCVStore.getState().updatePersonalInfo('firstName', 'Jane');
        useCVStore.getState().pushHistory(); // after the edit

        expect(useCVStore.getState().canUndo()).toBe(true);
        useCVStore.getState().undo();
        expect(useCVStore.getState().cv!.personalInfo.firstName).toBe('John');
      });

      it('one undo reverts exactly one edit', () => {
        const cv = makeCV();
        useCVStore.getState().setCV(cv);
        useCVStore.getState().pushHistory(); // baseline: John

        useCVStore.getState().updatePersonalInfo('firstName', 'Jane');
        useCVStore.getState().pushHistory();

        useCVStore.getState().updatePersonalInfo('firstName', 'Bob');
        useCVStore.getState().pushHistory();

        useCVStore.getState().undo();
        // Exactly one step back — not two, and not all the way to baseline.
        expect(useCVStore.getState().cv!.personalInfo.firstName).toBe('Jane');
      });

      it('push-BEFORE-mutate is now recoverable too, via drift detection', () => {
        const cv = makeCV();
        useCVStore.getState().setCV(cv);

        // The incorrect order CVEditor used to use.
        useCVStore.getState().pushHistory();
        useCVStore.getState().updatePersonalInfo('firstName', 'Jane');

        // This used to assert `canUndo() === false`, documenting that an edit
        // made after the snapshot was unreachable. `undo` now notices the live
        // document has drifted from the newest snapshot and records that drift
        // before stepping back, so the edit is undoable regardless of ordering.
        expect(useCVStore.getState().canUndo()).toBe(true);
        expect(useCVStore.getState().cv!.personalInfo.firstName).toBe('Jane');

        useCVStore.getState().undo();
        expect(useCVStore.getState().cv!.personalInfo.firstName).toBe('John');
      });
    });
  });
});

describe('undo does not discard un-snapshotted typing', () => {
  // pushHistory() only fires on STRUCTURAL edits. Typing runs ahead of the last
  // snapshot, and undo used to jump straight past it — losing the text, with no
  // redo path back because it had never been recorded.
  it('reverts typing first, and redo brings it back', () => {
    const s = () => useCVStore.getState();

    s().setCV(makeCV());
    s().resetHistory();

    // A structural edit takes a snapshot…
    s().pushHistory();
    // …then the user types, which does not.
    s().updatePersonalInfo('firstName', 'Jonathan');
    expect(s().cv!.personalInfo.firstName).toBe('Jonathan');

    s().undo();
    expect(s().cv!.personalInfo.firstName).toBe('John');

    s().redo();
    expect(s().cv!.personalInfo.firstName).toBe('Jonathan');
  });

  it('reports canUndo while the document has drifted from the newest snapshot', () => {
    const s = () => useCVStore.getState();

    s().setCV(makeCV());
    s().resetHistory();
    expect(s().canUndo()).toBe(false);

    s().updatePersonalInfo('firstName', 'Jane');
    expect(s().canUndo()).toBe(true);
  });
});
