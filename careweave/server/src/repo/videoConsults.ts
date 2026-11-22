import { baseRepo, idIndex } from './base.js';
import type { Collection, IndexSpec } from './store.js';
import type { VideoConsult } from './types.js';

// A video consult is one document (who, which doctor, when it expires). The browsers of the doctor and the patient set up their
// peer-to-peer call by leaving small signalling messages (offer, answer, network candidates, captions) in `videoSignals`
// and polling for the other side's messages, because a serverless host cannot hold a socket open.
export const videoConsultsIndexes: IndexSpec[] = [idIndex, { keys: { doctorId: 1, createdAt: -1 } }];
export const videoSignalsIndexes: IndexSpec[] = [idIndex, { keys: { consultId: 1, at: 1 } }];

/** The doctor's browser polls every second while the call screen is open; a consult whose doctor has been silent this long is not live. */
export const DOCTOR_SILENT_MS = 45_000;
export const isLive = (c: any, at = Date.now()) =>
  !c.endedAt && Date.parse(c.expiresAt) > at && at - Date.parse(c.doctorSeenAt || c.createdAt) < DOCTOR_SILENT_MS;

export const videoConsultsRepo = (c: Collection<VideoConsult>) => ({
  ...baseRepo(c),
  byToken: (token: string) => c.findOne({ id: token }),
  /** The newest consults of these doctors, for showing who is on a video call right now (filter with `isLive`). */
  recentForDoctors: (doctorIds: string[]) => (doctorIds.length ? c.find({ doctorId: { $in: doctorIds } }, { sort: { createdAt: -1 }, limit: 100 }) : Promise.resolve([] as any[])),
});

export const SIGNAL_TYPES = ['ready', 'offer', 'answer', 'ice', 'bye', 'caption', 'chat', 'lang'] as const;
/** Languages a call can be spoken in (the codes the browser's speech recognition uses). */
export const CALL_LANGUAGES = ['en-IN', 'ta-IN', 'hi-IN'] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];
export const MAX_SIGNALS_PER_CONSULT = 3000;

export const videoSignalsRepo = (c: Collection) => ({
  ...baseRepo(c),
  count: (consultId: string) => c.count({ consultId }),
  photoCount: (consultId: string) => c.count({ consultId, hasImage: true }),
  translationCount: (consultId: string) => c.count({ consultId, translated: true }),
  /** Everything that was said (typed chat and speech-to-text captions) from both sides, oldest first. */
  transcript: (consultId: string) => c.find({ consultId, type: { $in: ['chat', 'caption'] } }, { sort: { at: 1 }, limit: 800 }),
  /** What the other side has said since `since` (milliseconds), oldest first. */
  forReader: (consultId: string, reader: 'doctor' | 'patient', since: number) =>
    c.find({ consultId, from: reader === 'doctor' ? 'patient' : 'doctor', at: { $gt: since } }, { sort: { at: 1 }, limit: 200 }),
});
