import type mongoose from 'mongoose';
import { ConflictError, DuplicateError, VERSIONED, splitChanges, type Collection, type Filter, type FindOpts, type IndexSpec, type Store } from './store.js';

type Db = NonNullable<typeof mongoose.connection.db>;
type MongoColl<T = any> = ReturnType<Db['collection']> & { __t?: T };

// Every read is a query and every write is one operation on one document. Nothing is cached in the process, so several
// server instances can run against the same database.

class MongoCollection implements Collection {
  readonly versioned: boolean;
  private c: MongoColl<any>;
  constructor(db: Db, readonly name: string, private changed: (name: string) => void) {
    this.c = db.collection(name);
    this.versioned = VERSIONED.has(name);
  }

  async find(filter: Filter = {}, opts: FindOpts = {}) {
    let cur = this.c.find(filter, { projection: { _id: 0 } });
    if (opts.sort) cur = cur.sort(opts.sort);
    if (opts.skip) cur = cur.skip(opts.skip);
    if (opts.limit) cur = cur.limit(opts.limit);
    return cur.toArray();
  }
  findOne(filter: Filter) {
    return this.c.findOne(filter, { projection: { _id: 0 } });
  }
  count(filter: Filter = {}) {
    return this.c.countDocuments(filter);
  }
  async insert(doc: any) {
    const row = this.versioned ? { ...doc, version: doc.version ?? 1 } : { ...doc };
    try {
      await this.c.insertOne({ ...row }); // the driver adds _id to what it is given, so give it a copy
    } catch (err: any) {
      if (err?.code === 11000) throw new DuplicateError();
      throw err;
    }
    this.changed(this.name);
    return row;
  }
  async insertMany(docs: any[]) {
    if (!docs.length) return;
    try {
      await this.c.insertMany(docs.map((d) => (this.versioned ? { ...d, version: d.version ?? 1 } : { ...d })));
    } catch (err: any) {
      if (err?.code === 11000) throw new DuplicateError();
      throw err;
    }
    this.changed(this.name);
  }
  async update(current: any, changes: Filter, expected?: number) {
    const { set, unset } = splitChanges(changes);
    const ops: Filter = {};
    if (Object.keys(set).length) ops.$set = set;
    if (Object.keys(unset).length) ops.$unset = unset;
    const want = expected ?? current.version;
    if (this.versioned) ops.$inc = { version: 1 };
    else if (!ops.$set && !ops.$unset) return current;
    let res;
    try {
      res = await this.c.updateOne(this.versioned ? { id: current.id, version: want } : { id: current.id }, ops);
    } catch (err: any) {
      if (err?.code === 11000) throw new DuplicateError();
      throw err;
    }
    if (res.matchedCount === 0) throw new ConflictError();
    this.changed(this.name);
    const next = { ...current, ...set };
    for (const k of Object.keys(unset)) delete next[k];
    if (this.versioned) next.version = want + 1;
    return next;
  }
  async remove(filter: Filter) {
    const res = await this.c.deleteMany(filter);
    if (res.deletedCount) this.changed(this.name);
    return res.deletedCount;
  }
}

export class MongoStore implements Store {
  readonly mode = 'mongo' as const;
  constructor(private db: Db, private closeFn: () => Promise<void>, private onChange: (name: string) => void = () => {}) {}

  collection(name: string) {
    return new MongoCollection(this.db, name, this.onChange);
  }

  async ensureIndexes(specs: Record<string, IndexSpec[]>) {
    // Documents written before the version field existed start at 1; the old `rev` counter is dropped.
    for (const name of VERSIONED) {
      const c = this.db.collection(name);
      await c.updateMany({ version: { $exists: false } }, { $set: { version: 1 } });
      await c.updateMany({ rev: { $exists: true } }, { $unset: { rev: '' } });
    }
    // Bookings made before slotKey existed: give each active one its key, so the unique index covers them too.
    await this.db.collection('appointments').updateMany(
      { slotKey: { $exists: false }, doctorId: { $nin: ['', null] }, status: { $nin: ['Cancelled', 'Completed', 'No Show'] } },
      [{ $set: { slotKey: { $concat: ['$doctorId', '|', '$date', '|', '$time'] } } }]
    );
    // Sessions used to be keyed by `id` with a numeric `expires`. Those rows are unusable now, and their unique id index would
    // reject new rows that have no id.
    const sessions = this.db.collection('sessions');
    await sessions.dropIndex('id_1').catch(() => {});
    await sessions.deleteMany({ tokenHash: { $exists: false } });

    for (const [name, list] of Object.entries(specs)) {
      for (const s of list) {
        try {
          await this.db.collection(name).createIndex(s.keys, { unique: s.unique, expireAfterSeconds: s.expireAfterSeconds, partialFilterExpression: s.partial });
        } catch (err: any) {
          // A unique index fails when old data already has duplicates. The server still works, only without that guarantee.
          console.warn(`Could not create index ${name}.${Object.keys(s.keys).join('+')}:`, err?.message);
        }
      }
    }
  }

  close() {
    return this.closeFn();
  }
}
