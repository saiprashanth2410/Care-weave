// Storage contract shared by the MongoDB backend and the local-JSON dev fallback.
// Repos talk only to this interface, so the same route code runs against either.

export class ConflictError extends Error {
  constructor(message = 'Record was changed by someone else, reload and retry') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class DuplicateError extends Error {
  constructor(message = 'A record with this id already exists') {
    super(message);
    this.name = 'DuplicateError';
  }
}

export type Filter = Record<string, any>;
export type FindOpts = { sort?: Record<string, 1 | -1>; limit?: number; skip?: number };
export type IndexSpec = { keys: Record<string, 1 | -1>; unique?: boolean; expireAfterSeconds?: number; partial?: Filter };

/** Fields that must be unique across a collection (when present). The local fallback enforces these itself; MongoDB uses the unique indexes. */
export const UNIQUE_FIELDS: Record<string, string[]> = {
  patients: ['id', 'patientId'],
  appointments: ['id', 'slotKey'],
  sessions: ['tokenHash'],
  rateLimits: ['key'],
};

/** Collections whose documents carry a `version` and are written with optimistic concurrency. */
export const VERSIONED = new Set(['patients', 'encounters', 'labOrders', 'appointments', 'prescriptions']);

export interface Collection {
  readonly name: string;
  readonly versioned: boolean;
  find(filter?: Filter, opts?: FindOpts): Promise<any[]>;
  findOne(filter: Filter): Promise<any | null>;
  count(filter?: Filter): Promise<number>;
  /** Fails with DuplicateError when `id` is taken. A versioned document starts at version 1. */
  insert(doc: any): Promise<any>;
  insertMany(docs: any[]): Promise<void>;
  /**
   * Applies `changes` to `current` (an `undefined` value removes the field) and returns the new document.
   * Versioned collections write `updateOne({ id, version: expected }, { $set, $inc: { version: 1 } })` and throw
   * ConflictError when nothing matched; `expected` defaults to `current.version`.
   */
  update(current: any, changes: Filter, expected?: number): Promise<any>;
  remove(filter: Filter): Promise<number>;
  /**
   * Counts one hit for `key` in a window that starts at the first hit and lasts `windowMs`, as one atomic operation, so
   * concurrent callers on any number of instances are all counted.
   */
  hit(key: string, windowMs: number): Promise<{ count: number; resetAt: Date }>;
}

export interface Store {
  /** 'mongo' = every read and write goes to MongoDB. 'local' = in-process arrays saved to a JSON file (development only). */
  readonly mode: 'mongo' | 'local';
  collection(name: string): Collection;
  ensureIndexes(specs: Record<string, IndexSpec[]>): Promise<void>;
  close(): Promise<void>;
}

/** The part of a change that is data: never the key, the Mongo _id or the version counter. */
export function splitChanges(changes: Filter) {
  const set: Filter = {};
  const unset: Filter = {};
  for (const [k, v] of Object.entries(changes)) {
    if (k === 'id' || k === '_id' || k === 'version') continue;
    if (v === undefined) unset[k] = '';
    else set[k] = v;
  }
  return { set, unset };
}
