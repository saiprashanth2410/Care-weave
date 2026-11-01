// Storage contract shared by the MongoDB backend and the local-JSON dev fallback.
// Repos talk only to this interface, so the same route code runs against either.

export class ConflictError extends Error {
  constructor(message = 'Record was changed by someone else, reload and retry') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class DuplicateError extends Error {
  /** `field` is the unique field that clashed (id, slotKey, tokenKey ...), when the backend could tell. */
  constructor(public field = 'id', message = 'A record with this id already exists') {
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
  appointments: ['id', 'slotKey', 'patientKey', 'tokenKey'],
  sessions: ['tokenHash'],
  rateLimits: ['key'],
};

/** Collections whose documents carry a `version` and are written with optimistic concurrency. */
export const VERSIONED = new Set([
  'patients', 'encounters', 'labOrders', 'appointments', 'prescriptions',
  'referrals', 'carePlans', 'vitals', 'externalRecords', 'cases', 'users',
]);

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

/** Binary files (lab report attachments). MongoDB keeps them in the `files` collection; the local fallback keeps them on disk. */
export interface FileStore {
  put(id: string, data: Buffer): Promise<void>;
  get(id: string): Promise<Buffer | null>;
  delete(id: string): Promise<void>;
}

export interface Store {
  readonly files: FileStore;
  /** 'mongo' = every read and write goes to MongoDB. 'local' = in-process arrays saved to a JSON file (development only). */
  readonly mode: 'mongo' | 'local';
  collection(name: string): Collection;
  /**
   * Runs `fn` against a view of the store whose writes all commit together or not at all: if `fn` throws, none of them are kept.
   * MongoDB: a multi-document transaction (needs a replica set, which Atlas always is). The local file store restores a snapshot.
   * `fn` may run more than once (MongoDB retries a transaction after a transient error), so keep it free of side effects other than store writes.
   */
  transaction<T>(fn: (tx: Store) => Promise<T>): Promise<T>;
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
