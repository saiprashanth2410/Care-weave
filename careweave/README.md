# CareWeave

Front desk and laboratory portals on one backend and one database. Demonstration build, synthetic data only.

## Status

| Part | State |
|---|---|
| Front desk portal (registration, appointments, queue) | Built |
| Laboratory portal (orders, samples, results, verification, reports) | Built, details below |
| Doctor portal (overview, appointments, patient chart with unified timeline, encounters, prescriptions, lab review, care plans, referrals, calculators) | Built, server-backed |
| Unified patient timeline, external record import (JSON or CSV), patient matching, duplicate and conflict review | Built, server-backed. PDF import is not built |
| Report scanning (AI) | Built, needs an API key with quota (see below) |

## Run it

Requires Node 20+ and MongoDB (local `mongod` works).

```bash
cd server && cp .env.example .env && npm install && npm start     # API on :4000
cd client && npm install && npm run dev                           # app on :5173
```

`npm start` does not reload on file changes. Restart it after editing server code.

Open http://localhost:5173/login.

| Role | Email | Password |
|---|---|---|
| Front desk | reception@careweave.test | demo123 |
| Laboratory assistant | lab@careweave.test | demo123 |
| Laboratory verifier | pathologist@careweave.test | demo123 |
| Doctor | doctor@careweave.test | demo123 |

The database starts with these four accounts and nothing else.

## Environment (`server/.env`)

| Variable | Purpose |
|---|---|
| `MONGODB_URI`, `MONGODB_DB` | Database. Falls back to `data/careweave.json` if unset. |
| `GEMINI_API_KEY` | Report scanning. Reads with Gemma 4 through the Gemini API, falling back to Gemini Flash if Gemma is busy. `GEMINI_MODEL` picks the model tried first. Free keys allow about 20 scans a day. |
| `CLIENT_ORIGIN`, `PORT` | CORS origin and port. |

Keys stay on the server. Never put them in `client/`.

## Laboratory workflow

`requested -> collection pending -> collected -> processing -> awaiting verification -> verified -> released`, plus `recollect required` and `cancelled`.

- The server refuses any other jump, a cancel or recollect without a reason, and a submit with no results.
- An order links to a registered patient and one of that patient's visits. The lab sees only the patient ID, name, age and visit slots. An order for someone not registered here must be marked external.
- Only an account with the `verify` permission can verify, release or send back a submitted report, and never the person who entered the values.
- Changing results after submission is an amendment: a reason is required, old and new values are kept with who and when, and a verified report goes back to the queue.
- Each submission records the observation time. Report files (PDF, PNG, JPEG, 10 MB) are stored outside any public folder and served only to signed-in lab and doctor users.
- Result flags are only computed for plain numeric ranges. Banded ranges (for example lipids) show "Review against range".

## Lab API

All routes need `Authorization: Bearer <token>` from `POST /api/auth/login`.

| Method and path | Roles |
|---|---|
| `GET /api/lab/patients?query=` | lab |
| `GET /api/lab/orders`, `GET /api/lab/orders/:id` | lab, doctor |
| `POST /api/lab/orders` | lab, doctor |
| `PATCH /api/lab/orders/:id` (status, results, `amendReason`, `observedAt`) | lab |
| `POST /api/lab/orders/:id/attachments`, `GET .../attachments/:attId` | lab (upload), lab and doctor (download) |
| `POST /api/lab/extract` | lab |

## Tests

```bash
cd server && npm test                 # unit tests: lab value limits, scan checks, scanner against bad AI output, medicine parsing
cd server && npm run test:acceptance  # end-to-end, needs MongoDB
cd client && npm test                 # scanner screen and service (Vitest, Testing Library)
```

The acceptance run starts a throwaway server on a free port with its own database (`careweave_test`), runs about 100 checks (roles, doctor access, patient link, lab workflow, verification permission, amendments, impossible lab values, two receptionists booking one slot at once, stale edits, file upload, timeline, prescriptions, external import matching, duplicates, conflicts, reviewer decisions, audit, login rate limit) and drops the database. If MongoDB is not reachable it stops at once and says so.

## Doctor portal and record reconciliation

A doctor can open only patients they are linked to: an appointment assigned to them, or an encounter they wrote. Others get 403 and the attempt is audited. Prescriptions and lab orders must be tied to one of the doctor's encounters, and an allergy match blocks a prescription unless an override reason is sent.

External records (`POST /api/external-records/import`, JSON or CSV from the Import button) are matched to a patient by documented rules in `server/src/reconcile.ts`:

| Evidence | Points |
|---|---|
| Patient identifier | 50 |
| Date of birth | 25 |
| Phone (last 7 digits) | 20 |
| Name exact / similar | 20 / 10 |

A record is linked automatically only with an identifier plus one more matching field, a total of 70 or more, and no conflicting date of birth. Name and date of birth alone never link. Weak matches become a review case with the evidence shown, and unknown people stay unmatched and separate. Duplicates (same source id, or same facility, test and day with identical content) and conflicts (same report with different values, a medicine whose dose or frequency differs from an existing prescription, missing units or reference range) open a review case with both versions side by side. Originals are never deleted or merged, flagged results are left out of charts until a doctor decides, and a later repeat of the same test is treated as a new result.

| Method and path | Role |
|---|---|
| `GET /api/patients/:id/record` (timeline, chart, labs, prescriptions) | doctor, linked patients only |
| `POST /api/encounters`, `PATCH /api/encounters/:id` | doctor |
| `POST /api/patients/:id/vitals`, `/allergies`, `/problems` | doctor |
| `GET/POST/PATCH /api/referrals`, `/api/care-plans` | doctor |
| `GET/POST /api/lab-orders`, `PATCH /api/lab-orders/:id/status` (withdraw) | doctor |
| `POST/PATCH /api/prescriptions` | doctor |
| `POST /api/external-records/import`, `GET/PATCH /api/reconciliation/cases` | doctor |

Lab values reach the doctor only after a verifier releases them.

## Security notes

Passwords are bcrypt hashed. Sessions are stored as SHA-256 hashes and expire after 8 hours. Roles are checked on the server for every request. Sensitive actions are written to an audit log. Login and uploads are rate limited, and `helmet` sets security headers.

Not done: TLS configuration, an audit log viewer, PDF text extraction for imports.

## Known limits

- The server keeps the database in memory and writes every collection back on each change. Fine for a demo, not for many users. Edit MongoDB directly only while the server is stopped.
- `server/src/models.ts` holds Mongoose schemas that are not used yet.
- Report scanning has only been tested on synthetic images.
- The server reads `server/.env` and stores data under `server/` whatever folder it is started from. Run one server only: a second one on another port or in a sandbox that cannot reach MongoDB falls back to `server/data/careweave.json`, and the two stores then disagree.
- The doctor portal shows its own demo calculators (ASCVD, renal) with fixed example sliders. They are tools, not patient data.
- Patient gender is not captured at registration, so doctor-created lab orders have no gender until the lab fills it in.
- Terms and Privacy pages are drafts, not legal advice. The build makes no compliance claim.
