# CareWeave

Front desk and laboratory portals on one backend and one database. Demonstration build, synthetic data only.

## Status

| Part | State |
|---|---|
| Front desk portal (registration, appointments, queue) | Built |
| Laboratory portal (orders, samples, results, verification, reports) | Built, details below |
| Doctor portal | Not built |
| Unified patient timeline, external record import, duplicate and conflict review | Not built |
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
| Doctor (login only) | doctor@careweave.test | demo123 |

The database starts with these four accounts and nothing else.

## Environment (`server/.env`)

| Variable | Purpose |
|---|---|
| `MONGODB_URI`, `MONGODB_DB` | Database. Falls back to `data/careweave.json` if unset. |
| `ANTHROPIC_API_KEY` | Report scanning with Claude (used first when set). `ANTHROPIC_MODEL` overrides the model. |
| `GEMINI_API_KEY` | Report scanning with Gemini when no Anthropic key is set. Free keys allow about 20 scans a day. |
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
cd server && npm run test:acceptance
```

Starts a throwaway server and database (`careweave_test`, port 4100), runs 35 checks (roles, patient link, workflow, verification permission, amendments, file upload, audit, login rate limit) and drops the database.

## Security notes

Passwords are bcrypt hashed. Sessions are stored as SHA-256 hashes and expire after 8 hours. Roles are checked on the server for every request. Sensitive actions are written to an audit log. Login and uploads are rate limited, and `helmet` sets security headers.

Not done: object-level scoping for doctors, TLS configuration, and an audit log viewer.

## Known limits

- The server keeps the database in memory and writes every collection back on each change. Fine for a demo, not for many users. Edit MongoDB directly only while the server is stopped.
- `server/src/models.ts` holds Mongoose schemas that are not used yet.
- Report scanning has only been tested on synthetic images.
- Terms and Privacy pages are drafts, not legal advice. The build makes no compliance claim.
