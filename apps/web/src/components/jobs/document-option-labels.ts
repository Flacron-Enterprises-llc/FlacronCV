/**
 * Labels for "pick a document" <select> options (the CV linked to a cover
 * letter, the CV / cover letter used for a job application).
 *
 * People keep several versions of one CV under the same title ("Resume",
 * "Resume (Copy)" renamed back), and a list of identical titles gives no way
 * to tell them apart. Every option therefore carries its last-updated date;
 * where two documents with the same title were also updated on the same day
 * (typically a fresh duplicate), the time is added so the options still differ.
 */
export interface LabelledDocument {
  id: string;
  title: string;
  updatedAt?: unknown;
}

export function documentOptionLabels(
  docs: readonly LabelledDocument[],
  format: {
    /** Calendar date of a date-ish value. */
    date: (value: unknown) => string;
    /** Date and time of a date-ish value. */
    dateTime: (value: unknown) => string;
    /** Combines a title with its formatted timestamp (translated pattern). */
    label: (title: string, when: string) => string;
  },
): Map<string, string> {
  const titleOf = (doc: LabelledDocument) => doc.title.trim() || doc.id;
  const byDay = new Map<string, number>();
  for (const doc of docs) {
    const key = `${titleOf(doc)}\u0000${format.date(doc.updatedAt)}`;
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }

  const labels = new Map<string, string>();
  for (const doc of docs) {
    const title = titleOf(doc);
    const day = format.date(doc.updatedAt);
    const clash = (byDay.get(`${title}\u0000${day}`) ?? 0) > 1;
    labels.set(doc.id, format.label(title, clash ? format.dateTime(doc.updatedAt) : day));
  }
  return labels;
}
