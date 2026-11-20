import { baseRepo, idIndex } from './base.js';
import type { Collection, IndexSpec } from './store.js';

// A video consult is one document (who, which doctor, when it expires). The browsers of the doctor and the patient set up their
// peer-to-peer call by leaving small signalling messages (offer, answer, network candidates, captions) in `videoSignals`
// and polling for the other side's messages, because a serverless host cannot hold a socket open.
export const videoConsultsIndexes: IndexSpec[] = [idIndex, { keys: { doctorId: 1, createdAt: -1 } }];
export const videoSignalsIndexes: IndexSpec[] = [idIndex, { keys: { consultId: 1, at: 1 } }];

export const videoConsultsRepo = (c: Collection) => ({
  ...baseRepo(c),
  byToken: (token: string) => c.findOne({ id: token }),
});

export const SIGNAL_TYPES = ['ready', 'offer', 'answer', 'ice', 'bye', 'caption'] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];
export const MAX_SIGNALS_PER_CONSULT = 800;

export const videoSignalsRepo = (c: Collection) => ({
  ...baseRepo(c),
  count: (consultId: string) => c.count({ consultId }),
  /** What the other side has said since `since` (milliseconds), oldest first. */
  forReader: (consultId: string, reader: 'doctor' | 'patient', since: number) =>
    c.find({ consultId, from: reader === 'doctor' ? 'patient' : 'doctor', at: { $gt: since } }, { sort: { at: 1 }, limit: 200 }),
});
