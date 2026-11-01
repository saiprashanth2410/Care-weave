import mongoose from 'mongoose';
import { usersRepo, usersIndexes } from './users.js';
import { patientsRepo, patientsIndexes } from './patients.js';
import { appointmentsRepo, appointmentsIndexes } from './appointments.js';
import { ordersRepo, ordersIndexes } from './orders.js';
import { encountersRepo, encountersIndexes } from './encounters.js';
import { prescriptionsRepo, prescriptionsIndexes } from './prescriptions.js';
import { auditRepo, auditIndexes } from './audit.js';
import { sessionsRepo, sessionsIndexes } from './sessions.js';
import { rateLimitsRepo, rateLimitsIndexes } from './rateLimits.js';
import { vitalsRepo, vitalsIndexes } from './vitals.js';
import { referralsRepo, referralsIndexes } from './referrals.js';
import { carePlansRepo, carePlansIndexes } from './carePlans.js';
import { externalRecordsRepo, externalRecordsIndexes } from './externalRecords.js';
import { casesRepo, casesIndexes } from './cases.js';
import { syntheticHistoryRepo, syntheticHistoryIndexes } from './syntheticHistory.js';
import { whatsappPrefsRepo, whatsappPrefsIndexes } from './whatsappPrefs.js';
import { MongoStore } from './mongo.js';
import { LocalStore } from './local.js';
import type { Store } from './store.js';

export { ConflictError, DuplicateError, type Store } from './store.js';
export { LocalStore } from './local.js';

function collections(store: Store) {
  const c = (name: string) => store.collection(name);
  return {
    mode: store.mode,
    store,
    users: usersRepo(c('users')),
    patients: patientsRepo(c('patients')),
    appointments: appointmentsRepo(c('appointments')),
    orders: ordersRepo(c('labOrders')),
    encounters: encountersRepo(c('encounters')),
    prescriptions: prescriptionsRepo(c('prescriptions')),
    audit: auditRepo(c('auditLogs')),
    sessions: sessionsRepo(c('sessions')),
    rateLimits: rateLimitsRepo(c('rateLimits')),
    vitals: vitalsRepo(c('vitals')),
    referrals: referralsRepo(c('referrals')),
    carePlans: carePlansRepo(c('carePlans')),
    externalRecords: externalRecordsRepo(c('externalRecords')),
    cases: casesRepo(c('cases')),
    syntheticHistory: syntheticHistoryRepo(c('syntheticHistory')),
    whatsappPrefs: whatsappPrefsRepo(c('whatsappPrefs')),
  };
}
export type Repos = ReturnType<typeof collections> & {
  /** Everything written through the `Repos` given to `fn` is kept together or not at all (see `Store.transaction`). */
  transaction<T>(fn: (tx: Repos) => Promise<T>): Promise<T>;
};

export function createRepos(store: Store): Repos {
  return { ...collections(store), transaction: (fn) => store.transaction((tx) => fn(createRepos(tx))) };
}

export const INDEXES = {
  users: usersIndexes, patients: patientsIndexes, appointments: appointmentsIndexes, labOrders: ordersIndexes,
  encounters: encountersIndexes, prescriptions: prescriptionsIndexes, auditLogs: auditIndexes, sessions: sessionsIndexes, rateLimits: rateLimitsIndexes,
  vitals: vitalsIndexes, referrals: referralsIndexes, carePlans: carePlansIndexes, externalRecords: externalRecordsIndexes,
  cases: casesIndexes, syntheticHistory: syntheticHistoryIndexes, whatsappPrefs: whatsappPrefsIndexes,
};

/** Quiet collections change on every sign-in or page view; they are not worth waking other screens for. */
export const QUIET = new Set(['auditLogs', 'sessions', 'rateLimits']);

/** Connects to MongoDB. A failed connection is an error: it never quietly turns into per-instance local data. */
export async function openMongoStore(uri: string, dbName: string, onChange: (name: string) => void) {
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 8000, ignoreUndefined: true });
  const db = mongoose.connection.db!;
  return new MongoStore(db, () => mongoose.disconnect(), onChange, mongoose.connection.getClient());
}
