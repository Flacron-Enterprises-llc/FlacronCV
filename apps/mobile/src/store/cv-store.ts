import { create } from 'zustand';
import { CV, CVSection } from '../types/cv.types';
import { FontSize, Spacing } from '../types/enums';

const MAX_HISTORY = 50;

interface HistoryEntry {
  cv: CV;
  sections: CVSection[];
}

interface CVStoreState {
  cv: CV | null;
  sections: CVSection[];
  /** IDs of sections that exist in the database (fetched or already POSTed). */
  persistedSectionIds: string[];
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: Date | null;
  history: HistoryEntry[];
  historyIndex: number;

  // Actions
  reset: () => void;
  setCV: (cv: CV) => void;
  setSections: (sections: CVSection[]) => void;
  updatePersonalInfo: (field: string, value: string) => void;
  updateStyling: (field: string, value: string | boolean | FontSize | Spacing) => void;
  updateSection: (sectionId: string, data: Partial<CVSection>) => void;
  addSection: (section: CVSection) => void;
  removeSection: (sectionId: string) => void;
  reorderSections: (newOrder: string[]) => void;
  setIsSaving: (value: boolean) => void;
  setLastSavedAt: (date: Date) => void;
  /**
   * Set lastSavedAt, but only clear isDirty when the store still matches the
   * save's snapshot — so edits made while the save was in flight aren't lost.
   */
  markSaved: (snapshotCv: CV | null, snapshotSections: CVSection[]) => void;
  markClean: () => void;
  /** Called after a successful save to record which IDs now exist in the DB. */
  markSectionsPersisted: (ids: string[]) => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const useCVStore = create<CVStoreState>((set, get) => ({
  cv: null,
  sections: [],
  persistedSectionIds: [],
  isDirty: false,
  isSaving: false,
  lastSavedAt: null,
  history: [],
  historyIndex: -1,

  reset: () =>
    set({
      cv: null,
      sections: [],
      persistedSectionIds: [],
      isDirty: false,
      isSaving: false,
      lastSavedAt: null,
      history: [],
      historyIndex: -1,
    }),

  setCV: (cv) => {
    set({ cv, isDirty: false });
    get().pushHistory();
  },

  setSections: (sections) => {
    set({
      sections,
      persistedSectionIds: sections.map((s) => s.id),
    });
  },

  updatePersonalInfo: (field, value) => {
    const { cv } = get();
    if (!cv) return;
    get().pushHistory();
    set({
      cv: {
        ...cv,
        personalInfo: { ...cv.personalInfo, [field]: value },
      },
      isDirty: true,
    });
  },

  updateStyling: (field, value) => {
    const { cv } = get();
    if (!cv) return;
    get().pushHistory();
    set({
      cv: {
        ...cv,
        styling: { ...cv.styling, [field]: value },
      },
      isDirty: true,
    });
  },

  updateSection: (sectionId, data) => {
    const { sections } = get();
    get().pushHistory();
    set({
      sections: sections.map((s) => (s.id === sectionId ? { ...s, ...data } : s)),
      isDirty: true,
    });
  },

  addSection: (section) => {
    const { sections, cv } = get();
    get().pushHistory();
    set({
      sections: [...sections, section],
      cv: cv ? { ...cv, sectionOrder: [...cv.sectionOrder, section.id] } : cv,
      isDirty: true,
    });
  },

  removeSection: (sectionId) => {
    const { sections, cv } = get();
    get().pushHistory();
    set({
      sections: sections.filter((s) => s.id !== sectionId),
      cv: cv
        ? { ...cv, sectionOrder: cv.sectionOrder.filter((id) => id !== sectionId) }
        : cv,
      isDirty: true,
    });
  },

  reorderSections: (newOrder) => {
    const { cv, sections } = get();
    if (!cv) return;
    get().pushHistory();
    const reordered = newOrder
      .map((id, index) => {
        const section = sections.find((s) => s.id === id);
        return section ? { ...section, order: index } : null;
      })
      .filter(Boolean) as CVSection[];
    set({
      sections: reordered,
      cv: { ...cv, sectionOrder: newOrder },
      isDirty: true,
    });
  },

  setIsSaving: (value) => set({ isSaving: value }),
  setLastSavedAt: (date) => set({ lastSavedAt: date }),
  markSaved: (snapshotCv, snapshotSections) => {
    const cur = get();
    set({
      lastSavedAt: new Date(),
      isDirty: !(cur.cv === snapshotCv && cur.sections === snapshotSections),
    });
  },
  markClean: () => set({ isDirty: false }),
  markSectionsPersisted: (ids) => {
    const { persistedSectionIds, sections } = get();
    const next = [...persistedSectionIds];
    for (const id of ids) {
      if (!next.includes(id)) next.push(id);
    }
    set({
      persistedSectionIds: next.filter((id) => sections.some((s) => s.id === id)),
    });
  },

  pushHistory: () => {
    const { cv, sections, history, historyIndex } = get();
    if (!cv) return;

    const entry: HistoryEntry = { cv, sections: [...sections] };
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(entry);

    if (newHistory.length > MAX_HISTORY) {
      newHistory.shift();
    }

    set({ history: newHistory, historyIndex: newHistory.length - 1 });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    const entry = history[newIndex];
    set({ cv: entry.cv, sections: entry.sections, historyIndex: newIndex, isDirty: true });
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    const entry = history[newIndex];
    set({ cv: entry.cv, sections: entry.sections, historyIndex: newIndex, isDirty: true });
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,
}));
