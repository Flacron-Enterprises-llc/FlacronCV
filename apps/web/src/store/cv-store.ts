import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { CV, CVSection, PersonalInfo, CVStyling, UpdateCVData } from '@flacroncv/shared-types';

interface CVState {
  cv: CV | null;
  sections: CVSection[];
  /** IDs of sections that exist in the database (fetched or already POSTed). */
  persistedSectionIds: string[];
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: Date | null;
  history: { cv: CV; sections: CVSection[] }[];
  historyIndex: number;

  // Actions
  reset: () => void;
  setCV: (cv: CV) => void;
  setSections: (sections: CVSection[]) => void;
  updatePersonalInfo: (field: keyof PersonalInfo, value: string) => void;
  updateStyling: (field: keyof CVStyling, value: string | boolean) => void;
  updateSection: (sectionId: string, data: Partial<CVSection>) => void;
  addSection: (section: CVSection) => void;
  removeSection: (sectionId: string) => void;
  reorderSections: (newOrder: string[]) => void;
  setIsSaving: (saving: boolean) => void;
  setLastSavedAt: (date: Date) => void;
  /** Set lastSavedAt, but only clear isDirty when the store still matches the
   *  save's snapshot — so edits made while the save was in flight aren't lost. */
  markSaved: (snapshotCv: CV | null, snapshotSections: CVSection[]) => void;
  markClean: () => void;
  /** Called after a successful save to record which IDs now exist in the DB. */
  markSectionsPersisted: (ids: string[]) => void;
  /** Overwrite the persisted-section set EXACTLY (crash-recovery restore) so
   *  client-only restored sections stay unpersisted and are POSTed, not PUT. */
  setPersistedSectionIds: (ids: string[]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  pushHistory: () => void;
  /**
   * Discard all undo history and seed it with the CURRENT state as the single
   * baseline. Use when the document is (re)established from outside the edit
   * flow — opening a CV, or discarding a restored backup — so the user can
   * never undo their way back into a document they did not edit into existence.
   */
  resetHistory: () => void;
}

export const useCVStore = create<CVState>()(
  immer((set, get) => ({
    cv: null,
    sections: [],
    persistedSectionIds: [],
    isDirty: false,
    isSaving: false,
    lastSavedAt: null,
    history: [],
    historyIndex: -1,

    reset: () => set((state) => {
      state.cv = null;
      state.sections = [];
      state.persistedSectionIds = [];
      state.isDirty = false;
      state.isSaving = false;
      state.lastSavedAt = null;
      state.history = [];
      state.historyIndex = -1;
    }),

    setCV: (cv) => set((state) => {
      state.cv = cv;
      state.isDirty = false;
    }),

    setSections: (sections) => set((state) => {
      state.sections = sections;
      // All sections that arrive from the server are considered persisted
      state.persistedSectionIds = sections.map((s) => s.id);
    }),

    updatePersonalInfo: (field, value) => set((state) => {
      if (state.cv) {
        (state.cv.personalInfo as any)[field] = value;
        state.isDirty = true;
      }
    }),

    updateStyling: (field, value) => set((state) => {
      if (state.cv) {
        (state.cv.styling as any)[field] = value;
        state.isDirty = true;
      }
    }),

    updateSection: (sectionId, data) => set((state) => {
      const idx = state.sections.findIndex((s) => s.id === sectionId);
      if (idx !== -1) {
        Object.assign(state.sections[idx], data);
        state.isDirty = true;
      }
    }),

    addSection: (section) => set((state) => {
      state.sections.push(section);
      if (state.cv) {
        state.cv.sectionOrder.push(section.id);
      }
      state.isDirty = true;
    }),

    removeSection: (sectionId) => set((state) => {
      state.sections = state.sections.filter((s) => s.id !== sectionId);
      if (state.cv) {
        state.cv.sectionOrder = state.cv.sectionOrder.filter((id) => id !== sectionId);
      }
      state.isDirty = true;
    }),

    reorderSections: (newOrder) => set((state) => {
      if (state.cv) {
        state.cv.sectionOrder = newOrder;
        state.sections.sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));
        // Persist the new position on each section too. Autosave sends
        // `order` per section and getSections() sorts by it on reload — without
        // this the editor list would silently revert to the old order.
        state.sections.forEach((s, i) => { s.order = i; });
        state.isDirty = true;
      }
    }),

    setIsSaving: (saving) => set((state) => {
      state.isSaving = saving;
    }),

    setLastSavedAt: (date) => set((state) => {
      state.lastSavedAt = date;
      state.isDirty = false;
    }),

    markSaved: (snapshotCv, snapshotSections) => set((state) => {
      state.lastSavedAt = new Date();
      // Only mark clean if nothing changed since the save's snapshot; otherwise
      // edits made during the in-flight save would be wrongly discarded. immer
      // gives fresh cv/sections references on every edit, so identity compare is
      // sufficient. get() returns the pre-set (finalized) state, not the draft.
      const cur = get();
      if (cur.cv === snapshotCv && cur.sections === snapshotSections) {
        state.isDirty = false;
      }
    }),

    markClean: () => set((state) => {
      state.isDirty = false;
    }),

    markSectionsPersisted: (ids) => set((state) => {
      for (const id of ids) {
        if (!state.persistedSectionIds.includes(id)) {
          state.persistedSectionIds.push(id);
        }
      }
      // Remove any IDs that are no longer in sections (they were deleted)
      state.persistedSectionIds = state.persistedSectionIds.filter(
        (id) => state.sections.some((s) => s.id === id),
      );
    }),

    setPersistedSectionIds: (ids) => set((state) => {
      state.persistedSectionIds = ids.filter(
        (id) => state.sections.some((s) => s.id === id),
      );
    }),

    pushHistory: () => set((state) => {
      if (state.cv) {
        const snapshot = {
          cv: JSON.parse(JSON.stringify(state.cv)),
          sections: JSON.parse(JSON.stringify(state.sections)),
        };
        state.history = state.history.slice(0, state.historyIndex + 1);
        state.history.push(snapshot);
        state.historyIndex = state.history.length - 1;
        // Keep max 50 history entries
        if (state.history.length > 50) {
          state.history.shift();
          state.historyIndex--;
        }
      }
    }),

    resetHistory: () => set((state) => {
      if (!state.cv) {
        state.history = [];
        state.historyIndex = -1;
        return;
      }
      state.history = [
        {
          cv: JSON.parse(JSON.stringify(state.cv)),
          sections: JSON.parse(JSON.stringify(state.sections)),
        },
      ];
      state.historyIndex = 0;
    }),

    /**
     * Step back one snapshot — capturing anything not yet snapshotted first.
     *
     * `pushHistory()` is only called on STRUCTURAL edits (add/remove/reorder a
     * section or item). Typing into a field mutates the store without recording
     * a snapshot, so the live document routinely runs ahead of
     * `history[historyIndex]`. Stepping straight back therefore threw away every
     * keystroke since the last structural edit — and Redo could not bring them
     * back either, because they had never been in history at all. Someone who
     * wrote three paragraphs of a job description and then pressed Undo to
     * remove a bullet lost the paragraphs with no way to recover them.
     *
     * Recording the live state as its own entry first makes Undo lossless: the
     * first press reverts the un-snapshotted typing, Redo restores it.
     */
    undo: () => set((state) => {
      if (!state.cv) return;

      const live = {
        cv: JSON.parse(JSON.stringify(state.cv)),
        sections: JSON.parse(JSON.stringify(state.sections)),
      };
      const top = state.history[state.historyIndex];
      const hasUnsnapshottedEdits =
        top == null || JSON.stringify(top) !== JSON.stringify(live);

      if (hasUnsnapshottedEdits) {
        state.history = state.history.slice(0, state.historyIndex + 1);
        state.history.push(live);
        state.historyIndex = state.history.length - 1;
        if (state.history.length > 50) {
          state.history.shift();
          state.historyIndex--;
        }
      }

      if (state.historyIndex > 0) {
        state.historyIndex--;
        const snapshot = state.history[state.historyIndex];
        state.cv = snapshot.cv;
        state.sections = snapshot.sections;
        state.isDirty = true;
      }
    }),

    redo: () => set((state) => {
      if (state.historyIndex < state.history.length - 1) {
        state.historyIndex++;
        const snapshot = state.history[state.historyIndex];
        state.cv = snapshot.cv;
        state.sections = snapshot.sections;
        state.isDirty = true;
      }
    }),

    // Undo is available either when there is an earlier snapshot to return to,
    // OR when the live document has drifted from the newest one — that drift is
    // un-snapshotted typing, and reverting it is a legitimate undo.
    canUndo: () => {
      const s = get();
      if (s.historyIndex > 0) return true;
      if (!s.cv || s.historyIndex < 0) return false;
      const top = s.history[s.historyIndex];
      return (
        top != null &&
        JSON.stringify(top) !== JSON.stringify({ cv: s.cv, sections: s.sections })
      );
    },
    canRedo: () => get().historyIndex < get().history.length - 1,
  })),
);
