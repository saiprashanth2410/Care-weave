import type mongoose from 'mongoose';
import { ConflictError, DuplicateError, VERSIONED, splitChanges, stampChange, stampNew, type Collection, type FileStore, type Filter, type FindOpts, type IndexSpec, type Store } from './store.js';

type Db = NonNullable<typeof mongoose.connection.db>;
type MongoColl<T = any> = ReturnType<Db['collection']> & { __t?: T };
type Client = ReturnType<typeof mongoose.connection.getClient>;
type Session = ReturnType<Client['startSession']>;

// Every read is a query and every write is one operation on one document. Nothing is cached in the process, so several
// server instances can run against the same database.

class MongoCollection implements Collection {
  readonly versioned: boolean;
  private c: MongoColl<any>;
  constructor(db: Db, readonly name: string, private changed: (name: string) => void, private session?: Session) {
    this.c = db.collection(name);
    this.versioned = VERSIONED.has(name);
  }

  /** Inside a transaction every operation carries its session. */
  private get o() { return this.session ? { session: this.session } : {}; }

  async find(filter: Filter = {}, opts: FindOpts = {}) {
    let cur = this.c.find(filter, { projection: { _id: 0 }, ...this.o });
    if (opts.sort) cur = cur.sort(opts.sort);
    if (opts.skip) cur = cur.skip(opts.skip);
    if (opts.limit) cur = cur.limit(opts.limit);
    return cur.toArray();
  }
  findOne(filter: Filter) {
    return this.c.findOne(filter, { projection: { _id: 0 }, ...this.o });
  }
  count(filter: Filter = {}) {
    return this.c.countDocuments(filter, this.o);
  }
  async insert(doc: any) {
    const row = stampNew(this.name, this.versioned ? { ...doc, version: doc.version ?? 1 } : { ...doc });
    try {
      await this.c.insertOne({ ...row }, this.o); // the driver adds _id to what it is given, so give it a copy
    } catch (err: any) {
      if (err?.code === 11000) throw new DuplicateError(Object.keys(err.keyPattern ?? {})[0] ?? 'id');
      throw err;
    }
    this.changed(this.name);
    return row;
  }
  async insertMany(docs: any[]) {
    if (!docs.length) return;
    try {
      await this.c.insertMany(docs.map((d) => stampNew(this.name, this.versioned ? { ...d, version: d.version ?? 1 } : { ...d })), this.o);
    } catch (err: any) {
      if (err?.code === 11000) throw new DuplicateError(Object.keys(err.keyPattern ?? {})[0] ?? 'id');
      throw err;
    }
    this.changed(this.name);
  }
  async update(current: any, changes: Filter, expected?: number) {
    const { set, unset } = splitChanges(stampChange(this.name, changes));
    const ops: Filter = {};
    if (Object.keys(set).length) ops.$set = set;
    if (Object.keys(unset).length) ops.$unset = unset;
    const want = expected ?? current.version;
    if (this.versioned) ops.$inc = { version: 1 };
    else if (!ops.$set && !ops.$unset) return current;
    let res;
    try {
      res = await this.c.updateOne(this.versioned ? { id: current.id, version: want } : { id: current.id }, ops, this.o);
    } catch (err: any) {
      if (err?.code === 11000) throw new DuplicateError(Object.keys(err.keyPattern ?? {})[0] ?? 'id');
      throw err;
    }
    if (res.matchedCount === 0) throw new ConflictError();
    this.changed(this.name);
    const next = { ...current, ...set };
    for (const k of Object.keys(unset)) delete next[k];
    if (this.versioned) next.version = want + 1;
    return next;
  }
  async hit(key: string, windowMs: number) {
    const t = new Date();
    const expired = { $lte: [{ $ifNull: ['$resetAt', new Date(0)] }, t] };
    const run = () => this.c.findOneAndUpdate(
      { key },
      [{ $set: {
        count: { $cond: [expired, 1, { $add: [{ $ifNull: ['$count', 0] }, 1] }] },
        resetAt: { $cond: [expired, new Date(t.getTime() + windowMs), '$resetAt'] },
      } }],
      { upsert: true, returnDocument: 'after' }
    );
    let doc;
    try {
      doc = await run();
    } catch (err: any) {
      if (err?.code !== 11000) throw err;
      doc = await run(); // two first hits raced to create the row; the second now updates it
    }
    return { count: doc!.count as number, resetAt: doc!.resetAt as Date };
  }
  async remove(filter: Filter) {
    const res = await this.c.deleteMany(filter, this.o);
    if (res.deletedCount) this.changed(this.name);
    return res.deletedCount;
  }
}

export class MongoStore implements Store {
  readonly mode = 'mongo' as const;
  /** One document per file: { id, size, data }. Files are at most 10 MB, under MongoDB's 16 MB document limit. */
  readonly files: FileStore = {
    put: async (id, data) => { await this.db.collection('files').replaceOne({ id }, { id, size: data.length, data, at: new Date() }, { upsert: true }); },
    get: async (id) => {
      const doc = await this.db.collection('files').findOne({ id });
      return doc ? Buffer.from((doc.data as any).buffer) : null;
    },
    delete: async (id) => { await this.db.collection('files').deleteOne({ id }); },
  };

  private transactionsSupported = true;
  constructor(
    private db: Db, private closeFn: () => Promise<void>, private onChange: (name: string) => void = () => {},
    private client?: Client, private session?: Session,
  ) {}

  collection(name: string) {
    return new MongoCollection(this.db, name, this.onChange, this.session);
  }

  async transaction<T>(fn: (tx: Store) => Promise<T>): Promise<T> {
    if (this.session) return fn(this); // already inside one
    if (!this.client || !this.transactionsSupported) return fn(this);
    const session = this.client.startSession();
    const changed = new Set<string>();
    try {
      // withTransaction retries `fn` after a transient error, so what it collected on an earlier try is dropped.
      const out = await session.withTransaction(async () => {
        changed.clear();
        return fn(new MongoStore(this.db, this.closeFn, (n) => { changed.add(n); }, this.client, session));
      }) as T;
      for (const n of changed) this.onChange(n); // other screens are told only once the data is really committed
      return out;
    } catch (err: any) {
      // A standalone mongod has no transactions. The first command fails before anything is written, so running `fn`
      // without one loses nothing; it just loses the all-or-nothing guarantee, which is said once in the log.
      if (err?.codeName === 'IllegalOperation' || /Transaction numbers are only allowed|does not support retryable writes/.test(err?.message ?? '')) {
        this.transactionsSupported = false;
        console.warn('[storage] This MongoDB server does not support transactions (it is not a replica set). Multi-document writes are NOT atomic here.');
        return fn(this);
      }
      throw err;
    } finally {
      await session.endSession();
    }
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
