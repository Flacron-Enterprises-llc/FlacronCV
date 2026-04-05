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
  markClean: () => void;
  /** Called after a successful save to record which IDs now exist in the DB. */
  markSectionsPersisted: (ids: string[]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  pushHistory: () => void;
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

    undo: () => set((state) => {
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

    canUndo: () => get().historyIndex > 0,
    canRedo: () => get().historyIndex < get().history.length - 1,
  })),
);
