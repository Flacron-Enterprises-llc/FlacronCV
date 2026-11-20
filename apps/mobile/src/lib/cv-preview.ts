/** Wait this long after the last edit before asking for a new render. */
export const PREVIEW_DEBOUNCE_MS = 600;

/** The editor's UNSAVED state, in the shape POST /cvs/:id/preview accepts (only what the renderer reads). */
export function previewBody(cv: { templateId?: string; styling?: unknown; personalInfo?: unknown } | null, sections: unknown[]) {
  return {
    templateId: cv?.templateId,
    styling: cv?.styling ?? undefined,
    personalInfo: cv?.personalInfo ?? undefined,
    sections,
  };
}
