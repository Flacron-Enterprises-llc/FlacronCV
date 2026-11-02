import {
  documentFromBody,
  letterTextToHtml,
  type FactForDocument,
  type ResumeBody,
  type SharedCvDocument,
  type SharedCvSectionType,
} from '@flacroncv/career-shared';

/**
 * One-way, person-initiated copy of a career draft into V1's own editors.
 *
 * V1 stays the owner of CVs and cover letters (Firestore): the copy is a new
 * V1 document made through V1's existing endpoints, so V1's plan limits,
 * template tiers and validation all apply. Nothing links the copy back to the
 * draft and nothing synchronises them afterwards.
 */

/** The subset of V1's `api` client this module uses. */
export interface V1Api {
  get<T>(endpoint: string): Promise<T>;
  post<T>(endpoint: string, body?: unknown): Promise<T>;
  put<T>(endpoint: string, body?: unknown): Promise<T>;
  delete<T>(endpoint: string): Promise<T>;
}

interface V1Section {
  id: string;
  type: string;
  title: string;
  order: number;
}

export interface V1CvPlan {
  create: { title: string; templateId: string; personalInfo: Record<string, string | null> };
  sections: Array<{ type: SharedCvSectionType; title: string; items: Record<string, unknown>[] }>;
}

/** V1's personal-info fields; anything else from the document is dropped rather than rejected by V1's DTO. */
const V1_PERSONAL_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'address',
  'city',
  'country',
  'postalCode',
  'website',
  'linkedin',
  'github',
  'headline',
  'summary',
] as const;

export function planV1Cv(
  body: ResumeBody,
  facts: FactForDocument[],
  title: string,
  sectionTitle: (type: SharedCvSectionType) => string,
): V1CvPlan {
  const document: SharedCvDocument = documentFromBody(body, facts, { title });
  const personalInfo: Record<string, string | null> = {};
  for (const field of V1_PERSONAL_FIELDS) {
    const value = document.personalInfo[field];
    if (typeof value === 'string' && value.trim()) personalInfo[field] = value;
  }
  return {
    create: { title: title.trim() || 'CV', templateId: document.templateId, personalInfo },
    sections: document.sections
      .filter((section) => section.items.length > 0)
      .map((section) => ({ type: section.type, title: sectionTitle(section.type), items: section.items.map(withoutUnstatedClaims) })),
  };
}

/**
 * The shared converter fills `level: 'intermediate'` for every skill. A career
 * fact never records a level, and V1's export prints one when present, so the
 * copy leaves it out instead of stating a level the person never confirmed.
 */
function withoutUnstatedClaims(item: Record<string, unknown>): Record<string, unknown> {
  if (!('level' in item)) return item;
  const { level: _level, ...rest } = item;
  return rest;
}

/**
 * Creates the V1 CV. V1 seeds sample sections on create; a sample whose type
 * the plan has is overwritten, any other sample is removed, and the plan's
 * remaining sections are added in order. Returns the new V1 CV id.
 *
 * Every call goes through V1's API with the person's own token. A failure
 * part-way throws `PartialV1CopyError` carrying the new V1 id: pass it back as
 * `resumeInto` to finish filling that same CV. V1 counts every creation
 * against the plan (deleting does not give it back), so a retry must never
 * create a second CV.
 */
export async function createV1Cv(api: V1Api, plan: V1CvPlan, resumeInto?: string): Promise<string> {
  const cv = resumeInto
    ? await api.get<{ id: string; personalInfo?: Record<string, unknown> }>(`/cvs/${resumeInto}`).then((found) => ({ ...found, id: resumeInto }))
    : await api.post<{ id: string; personalInfo?: Record<string, unknown> }>('/cvs', plan.create);
  try {
    await fillV1Cv(api, plan, cv);
  } catch (error) {
    throw new PartialV1CopyError(cv.id, error);
  }
  return cv.id;
}

/** A V1 document was created but not completely filled; retry with `resumeInto: v1Id`. */
export class PartialV1CopyError extends Error {
  constructor(
    readonly v1Id: string,
    readonly cause: unknown,
  ) {
    super('partial_v1_copy');
    this.name = 'PartialV1CopyError';
  }
}

async function fillV1Cv(api: V1Api, plan: V1CvPlan, cv: { id: string; personalInfo?: Record<string, unknown> }): Promise<void> {
  // V1's create ignores supplied personal details and seeds a generic sample
  // summary. Write the person's own details over it; with no summary in the
  // draft the sample is cleared rather than left as a claim they never made.
  await api.put(`/cvs/${cv.id}`, {
    personalInfo: { ...(cv.personalInfo ?? {}), ...plan.create.personalInfo, summary: plan.create.personalInfo.summary ?? '' },
  });
  const seeded = await api.get<V1Section[]>(`/cvs/${cv.id}/sections`);
  const remaining = [...plan.sections];
  for (const sample of seeded) {
    const index = remaining.findIndex((section) => section.type === sample.type);
    if (index === -1) {
      await api.delete(`/cvs/${cv.id}/sections/${sample.id}`);
      continue;
    }
    const [section] = remaining.splice(index, 1);
    await api.put(`/cvs/${cv.id}/sections/${sample.id}`, { title: section.title, items: section.items, order: plan.sections.indexOf(section) });
  }
  for (const section of remaining) {
    await api.post(`/cvs/${cv.id}/sections`, {
      type: section.type,
      title: section.title,
      order: plan.sections.indexOf(section),
      isVisible: true,
      items: section.items,
    });
  }
}

/** Creates a V1 cover letter from a career letter draft. Returns the new V1 id. Same retry rule as `createV1Cv`. */
export async function createV1CoverLetter(api: V1Api, draft: { title: string; body: string }, resumeInto?: string): Promise<string> {
  const id = resumeInto ?? (await api.post<{ id: string }>('/cover-letters', { title: draft.title.trim() || 'Cover letter' })).id;
  try {
    await api.put(`/cover-letters/${id}`, { content: letterTextToHtml(draft.body) });
  } catch (error) {
    throw new PartialV1CopyError(id, error);
  }
  return id;
}
