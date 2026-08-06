/**
 * In-memory Firestore implementation for development mode.
 * Used when Firebase Admin SDK doesn't have proper Firestore credentials.
 * Data is lost on server restart.
 */

import { FieldValue } from 'firebase-admin/firestore';

type DocData = Record<string, unknown>;

/**
 * Resolves FieldValue transforms the way real Firestore would. Only numeric
 * increment is supported (the only transform this codebase uses); other
 * transforms leave the existing value untouched.
 */
function resolveFieldValue(existing: unknown, value: unknown): unknown {
  if (value instanceof FieldValue) {
    const operand = (value as unknown as { operand?: unknown }).operand;
    if (typeof operand === 'number') {
      return ((typeof existing === 'number' ? existing : 0) as number) + operand;
    }
    return existing;
  }
  return value;
}

class InMemoryDocumentSnapshot {
  constructor(
    private _id: string,
    private _data: DocData | undefined,
    // Real Firestore snapshots expose .ref; consumers use it for batch writes.
    public readonly ref?: InMemoryDocumentReference,
  ) {}

  get exists(): boolean {
    return this._data !== undefined;
  }

  get id(): string {
    return this._id;
  }

  data(): DocData | undefined {
    return this._data ? JSON.parse(JSON.stringify(this._data)) : undefined;
  }
}

class InMemoryQuerySnapshot {
  constructor(public readonly docs: InMemoryDocumentSnapshot[]) {}

  get empty(): boolean {
    return this.docs.length === 0;
  }

  get size(): number {
    return this.docs.length;
  }
}

class InMemoryDocumentReference {
  constructor(
    private store: Map<string, Map<string, DocData>>,
    private collectionPath: string,
    private docId: string,
  ) {}

  async set(data: DocData): Promise<void> {
    if (!this.store.has(this.collectionPath)) {
      this.store.set(this.collectionPath, new Map());
    }
    this.store.get(this.collectionPath)!.set(this.docId, JSON.parse(JSON.stringify(data)));
  }

  async get(): Promise<InMemoryDocumentSnapshot> {
    const coll = this.store.get(this.collectionPath);
    const data = coll?.get(this.docId);
    return new InMemoryDocumentSnapshot(this.docId, data, this);
  }

  async update(data: DocData): Promise<void> {
    const coll = this.store.get(this.collectionPath);
    const existing = coll?.get(this.docId);
    if (!existing) {
      throw new Error(`Document ${this.collectionPath}/${this.docId} not found`);
    }
    // Handle dot-notation updates (e.g., "profile.firstName")
    const updated = { ...existing };
    for (const [key, value] of Object.entries(data)) {
      if (key.includes('.')) {
        const parts = key.split('.');
        let obj: any = updated;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!obj[parts[i]] || typeof obj[parts[i]] !== 'object') {
            obj[parts[i]] = {};
          }
          obj = obj[parts[i]];
        }
        const leaf = parts[parts.length - 1];
        obj[leaf] = resolveFieldValue(obj[leaf], value);
      } else {
        updated[key] = resolveFieldValue(updated[key], value);
      }
    }
    coll!.set(this.docId, updated);
  }

  async delete(): Promise<void> {
    const coll = this.store.get(this.collectionPath);
    coll?.delete(this.docId);
  }

  collection(name: string): InMemoryCollectionReference {
    return new InMemoryCollectionReference(this.store, `${this.collectionPath}/${this.docId}/${name}`);
  }
}

class InMemoryBatch {
  private operations: Array<() => Promise<void>> = [];

  update(ref: InMemoryDocumentReference, data: DocData): void {
    this.operations.push(() => ref.update(data));
  }

  set(ref: InMemoryDocumentReference, data: DocData): void {
    this.operations.push(() => ref.set(data));
  }

  delete(ref: InMemoryDocumentReference): void {
    this.operations.push(() => ref.delete());
  }

  async commit(): Promise<void> {
    for (const op of this.operations) {
      await op();
    }
  }
}

class InMemoryTransaction {
  private operations: Array<() => Promise<void>> = [];

  // Reads are live (single-threaded test double — no real isolation needed).
  async get(ref: InMemoryDocumentReference): Promise<InMemoryDocumentSnapshot> {
    return ref.get();
  }

  update(ref: InMemoryDocumentReference, data: DocData): void {
    this.operations.push(() => ref.update(data));
  }

  set(ref: InMemoryDocumentReference, data: DocData): void {
    this.operations.push(() => ref.set(data));
  }

  delete(ref: InMemoryDocumentReference): void {
    this.operations.push(() => ref.delete());
  }

  async commitOps(): Promise<void> {
    for (const op of this.operations) {
      await op();
    }
  }
}

class InMemoryQuery {
  private filters: Array<{ field: string; op: string; value: unknown }> = [];
  private orderByField: string | null = null;
  private orderByDir: string = 'asc';
  private limitCount: number | null = null;
  private offsetCount: number = 0;

  constructor(
    private store: Map<string, Map<string, DocData>>,
    private collectionPath: string,
  ) {}

  where(field: string, op: string, value: unknown): InMemoryQuery {
    const q = this.clone();
    q.filters.push({ field, op, value });
    return q;
  }

  orderBy(field: string, direction: string = 'asc'): InMemoryQuery {
    const q = this.clone();
    q.orderByField = field;
    q.orderByDir = direction;
    return q;
  }

  limit(count: number): InMemoryQuery {
    const q = this.clone();
    q.limitCount = count;
    return q;
  }

  offset(count: number): InMemoryQuery {
    const q = this.clone();
    q.offsetCount = count;
    return q;
  }

  count(): { get: () => Promise<{ data: () => { count: number } }> } {
    return {
      get: async () => {
        const snapshot = await this.get();
        return {
          data: () => ({ count: snapshot.size }),
        };
      },
    };
  }

  async get(): Promise<InMemoryQuerySnapshot> {
    const coll = this.store.get(this.collectionPath);
    if (!coll) return new InMemoryQuerySnapshot([]);

    let entries = Array.from(coll.entries());

    // Apply filters
    for (const filter of this.filters) {
      entries = entries.filter(([, data]) => {
        const fieldValue = this.getNestedValue(data, filter.field);
        switch (filter.op) {
          case '==': return fieldValue === filter.value;
          case '!=': return fieldValue !== filter.value;
          case '>': return (fieldValue as number) > (filter.value as number);
          case '>=': return (fieldValue as number) >= (filter.value as number);
          case '<': return (fieldValue as number) < (filter.value as number);
          case '<=': return (fieldValue as number) <= (filter.value as number);
          case 'in': return (filter.value as unknown[]).includes(fieldValue);
          default: return true;
        }
      });
    }

    // Apply orderBy
    if (this.orderByField) {
      const field = this.orderByField;
      const dir = this.orderByDir;
      entries.sort(([, a], [, b]) => {
        const aVal = this.getNestedValue(a, field);
        const bVal = this.getNestedValue(b, field);
        if (aVal === bVal) return 0;
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        const cmp = aVal < bVal ? -1 : 1;
        return dir === 'desc' ? -cmp : cmp;
      });
    }

    // Apply offset
    if (this.offsetCount > 0) {
      entries = entries.slice(this.offsetCount);
    }

    // Apply limit
    if (this.limitCount !== null) {
      entries = entries.slice(0, this.limitCount);
    }

    const docs = entries.map(
      ([id, data]) =>
        new InMemoryDocumentSnapshot(
          id,
          data,
          new InMemoryDocumentReference(this.store, this.collectionPath, id),
        ),
    );
    return new InMemoryQuerySnapshot(docs);
  }

  private getNestedValue(obj: DocData, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  private clone(): InMemoryQuery {
    const q = new InMemoryQuery(this.store, this.collectionPath);
    q.filters = [...this.filters];
    q.orderByField = this.orderByField;
    q.orderByDir = this.orderByDir;
    q.limitCount = this.limitCount;
    q.offsetCount = this.offsetCount;
    return q;
  }
}

class InMemoryCollectionReference extends InMemoryQuery {
  constructor(
    private _store: Map<string, Map<string, DocData>>,
    private _collectionPath: string,
  ) {
    super(_store, _collectionPath);
  }

  doc(id: string): InMemoryDocumentReference {
    return new InMemoryDocumentReference(this._store, this._collectionPath, id);
  }
}

export class InMemoryFirestore {
  private store = new Map<string, Map<string, DocData>>();
  // Serialize transactions so concurrent runTransaction() calls don't read stale
  // state — a conservative model of Firestore's serializable-transaction guarantee
  // (never permits a race the real DB would reject).
  private txChain: Promise<unknown> = Promise.resolve();

  collection(name: string): InMemoryCollectionReference {
    return new InMemoryCollectionReference(this.store, name);
  }

  batch(): InMemoryBatch {
    return new InMemoryBatch();
  }

  async runTransaction<T>(fn: (tx: InMemoryTransaction) => Promise<T>): Promise<T> {
    const run = this.txChain.then(async () => {
      const tx = new InMemoryTransaction();
      const result = await fn(tx);
      await tx.commitOps();
      return result;
    });
    // Keep the chain alive even if this transaction rejects.
    this.txChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
