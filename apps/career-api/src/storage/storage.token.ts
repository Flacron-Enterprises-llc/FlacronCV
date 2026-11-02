/** One private file store per process, shared by data exports, evidence files, and the cleanup sweep. */
export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
