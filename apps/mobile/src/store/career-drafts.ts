/**
 * Unsaved career-draft edits, in memory only. They survive moving between
 * screens and the app going to the background, but are never written to disk
 * (private documents stay off the device) and are dropped on sign-out.
 * Keyed by uid + document so another account on the device never sees them.
 */
const edits = new Map<string, Record<string, string>>();

function key(uid: string, docId: string): string {
  return `${uid}:${docId}`;
}

export const careerDrafts = {
  get(uid: string, docId: string): Record<string, string> | undefined {
    return edits.get(key(uid, docId));
  },
  set(uid: string, docId: string, value: Record<string, string>): void {
    if (Object.keys(value).length === 0) edits.delete(key(uid, docId));
    else edits.set(key(uid, docId), value);
  },
  clear(uid: string, docId: string): void {
    edits.delete(key(uid, docId));
  },
  /** Drops every unsaved edit of one account (after its career data is erased). */
  clearUser(uid: string): void {
    for (const stored of [...edits.keys()]) if (stored.startsWith(`${uid}:`)) edits.delete(stored);
  },
  clearAll(): void {
    edits.clear();
  },
};
