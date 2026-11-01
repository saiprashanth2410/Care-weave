import fs from 'node:fs/promises';
import path from 'node:path';
import { ConflictError, DuplicateError, UNIQUE_FIELDS, VERSIONED, splitChanges, type Collection, type Filter, type FindOpts, type IndexSpec, type Store } from './store.js';

// Development fallback used only when MONGODB_URI is not set. Documents live in process memory and are saved to one JSON
// file after every write. It is single-process: two server instances would overwrite each other's file, which is exactly
// why production uses MongoDB. Sessions are never written to the file.

const NOT_PERSISTED = new Set(['sessions', 'rateLimits']);

/** The subset of MongoDB query operators the repos use: equality, $in, $nin, $ne, $gte, $lte, $regex and $or. */
export function matches(doc: any, filter: Filter = {}): boolean {
  return Object.entries(filter).every(([k, cond]) => {
    if (k === '$or') return (cond as Filter[]).some((f) => matches(doc, f));
    const v = doc[k];
    if (cond && typeof cond === 'object' && !Array.isArray(cond) && Object.keys(cond).some((x) => x.startsWith('$'))) {
      return Object.entries(cond).every(([op, arg]: [string, any]) => {
        switch (op) {
          case '$in': return arg.includes(v);
          case '$nin': return !arg.includes(v);
          case '$ne': return v !== arg;
          case '$gte': return v !== undefined && v >= arg;
          case '$lte': return v !== undefined && v <= arg;
          case '$regex': return new RegExp(arg, cond.$options).test(String(v ?? ''));
          case '$options': return true;
          default: throw new Error(`Unsupported filter operator ${op}`);
        }
      });
    }
    return v === cond;
  });
}

class LocalCollection implements Collection {
  docs: any[] = [];
  readonly versioned: boolean;
  constructor(readonly name: string, private save: () => Promise<void>, private changed: (name: string) => void) {
    this.versioned = VERSIONED.has(name);
  }

  private clash(doc: any, exceptId?: string) {
    const fields = UNIQUE_FIELDS[this.name] ?? ['id'];
    return fields.find((f) => doc[f] !== undefined && this.docs.some((d) => d !== doc && d.id !== exceptId && d[f] === doc[f]));
  }

  async find(filter?: Filter, opts: FindOpts = {}) {
    let rows = this.docs.filter((d) => matches(d, filter));
    if (opts.sort) {
      const sorts = Object.entries(opts.sort);
      rows = [...rows].sort((a, b) => {
        for (const [k, dir] of sorts) {
          const c = a[k] === b[k] ? 0 : a[k] === undefined ? -1 : b[k] === undefined ? 1 : a[k] < b[k] ? -1 : 1;
          if (c) return c * dir;
        }
        return 0;
      });
    }
    if (opts.skip) rows = rows.slice(opts.skip);
    if (opts.limit) rows = rows.slice(0, opts.limit);
    return rows.map((d) => structuredClone(d));
  }
  async findOne(filter: Filter) {
    const d = this.docs.find((x) => matches(x, filter));
    return d ? structuredClone(d) : null;
  }
  async count(filter?: Filter) {
    return this.docs.filter((d) => matches(d, filter)).length;
  }
  async insert(doc: any) {
    const row = structuredClone(this.versioned ? { ...doc, version: doc.version ?? 1 } : doc);
    { const f = this.clash(row); if (f) throw new DuplicateError(f); }
    this.docs.push(row);
    await this.save();
    this.changed(this.name);
    return structuredClone(row);
  }
  async insertMany(docs: any[]) {
    for (const d of docs) {
      const row = structuredClone(this.versioned ? { ...d, version: d.version ?? 1 } : d);
      { const f = this.clash(row); if (f) throw new DuplicateError(f); }
      this.docs.push(row);
    }
    await this.save();
    this.changed(this.name);
  }
  async update(current: any, changes: Filter, expected?: number) {
    const stored = this.docs.find((d) => d.id === current.id);
    const want = expected ?? current.version;
    if (!stored || (this.versioned && stored.version !== want)) throw new ConflictError();
    const { set, unset } = splitChanges(changes);
    const next = { ...stored, ...structuredClone(set) };
    for (const k of Object.keys(unset)) delete next[k];
    { const f = this.clash(next, stored.id); if (f) throw new DuplicateError(f); }
    Object.assign(stored, structuredClone(set));
    for (const k of Object.keys(unset)) delete stored[k];
    if (this.versioned) stored.version = want + 1;
    await this.save();
    this.changed(this.name);
    return structuredClone(stored);
  }
  async hit(key: string, windowMs: number) {
    const t = Date.now();
    let row = this.docs.find((d) => d.key === key);
    if (!row || row.resetAt.getTime() <= t) {
      this.docs = this.docs.filter((d) => d.resetAt.getTime() > t && d.key !== key); // also sweeps expired rows
      row = { key, count: 0, resetAt: new Date(t + windowMs) };
      this.docs.push(row);
    }
    row.count++;
    return { count: row.count, resetAt: row.resetAt };
  }
  async remove(filter: Filter) {
    const before = this.docs.length;
    this.docs = this.docs.filter((d) => !matches(d, filter));
    if (this.docs.length !== before) { await this.save(); this.changed(this.name); }
    return before - this.docs.length;
  }
}

export class LocalStore implements Store {
  readonly mode = 'local' as const;
  private colls = new Map<string, LocalCollection>();
  private writing: Promise<void> = Promise.resolve();

  /** `file` is where data is saved; null keeps everything in memory (tests). `onChange` fires after each write. */
  constructor(private file: string | null, private onChange: (name: string) => void = () => {}) {}

  /** Loads the JSON file if there is one and gives every versioned document a version (documents older than the field get 1). */
  async load(seed: () => Promise<Record<string, any[]>>) {
    let data: Record<string, any[]> | null = null;
    if (this.file) {
      try { data = JSON.parse(await fs.readFile(this.file, 'utf8')); } catch { data = null; }
    }
    const fresh = !data;
    data ??= await seed();
    for (const [name, rows] of Object.entries(data)) {
      const c = this.collection(name) as LocalCollection;
      c.docs = rows.map((d) => (c.versioned ? migrateVersion(d) : d));
    }
    if (fresh) await this.persist();
  }

  collection(name: string) {
    let c = this.colls.get(name);
    if (!c) { c = new LocalCollection(name, () => this.persist(), this.onChange); this.colls.set(name, c); }
    return c;
  }

  private txQueue: Promise<unknown> = Promise.resolve();

  /**
   * All-or-nothing for development: a snapshot of every collection is restored if `fn` throws. Transactions run one at a time.
   * A write from an unrelated request that lands while a transaction is open is also undone by a rollback; the local file mode
   * is single-user development storage, which is why production uses MongoDB.
   */
  transaction<T>(fn: (tx: Store) => Promise<T>): Promise<T> {
    const run = async () => {
      const snapshot = new Map([...this.colls].map(([n, c]) => [n, structuredClone(c.docs)]));
      try {
        return await fn(this);
      } catch (err) {
        for (const [n, c] of this.colls) c.docs = snapshot.get(n) ?? [];
        await this.persist();
        throw err;
      }
    };
    const next = this.txQueue.then(run, run);
    this.txQueue = next.catch(() => {});
    return next;
  }

  private persist() {
    if (!this.file) return Promise.resolve();
    const file = this.file;
    // Writes are queued so two requests never interleave. Temp file then rename: a crash mid-write keeps the old file.
    this.writing = this.writing.then(async () => {
      const out: Record<string, any[]> = {};
      for (const [name, c] of this.colls) if (!NOT_PERSISTED.has(name)) out[name] = c.docs;
      await fs.mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(out, null, 2));
      await fs.rename(tmp, file);
    });
    return this.writing;
  }

  async ensureIndexes(_specs: Record<string, IndexSpec[]>) {}
  async close() { await this.writing; }
}

/** A document saved before the version field existed starts at 1. The old `rev` counter is dropped. */
export function migrateVersion(d: any) {
  const { rev: _rev, ...rest } = d;
  return { ...rest, version: Number.isInteger(d.version) ? d.version : 1 };
}
