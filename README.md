# CareWeave 🏥

> One clinical platform where the front desk, the lab and the doctor finally work from the same patient record.

[![Analytics: Exasol Personal](https://img.shields.io/badge/Analytics-Exasol_Personal_In--Memory-blueviolet.svg)](EXASOL_SETUP.md)
[![Built with Gemma 4](https://img.shields.io/badge/Vision_AI-Gemma_4-blue.svg)](https://ai.google.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

CareWeave is a unified multi-role EHR and lab platform built for the HealthTech challenge: *From Siloed Patient Records to Unified Patient Health Records*.

It is a demonstration build. Everything you see runs on **synthetic data**, and it is clinical-review support, not a diagnostic system.

---

## Why we built this

Walk into most community hospitals and diagnostic labs and you will see the same few problems:

- Patients show up with crumpled paper lab slips from some other lab.
- Receptionists and lab technicians retype values by hand, and a misplaced decimal quietly becomes a wrong number in the chart.
- Doctors prescribe without seeing outside records, or without noticing that a new drug is in the same family as one the patient is allergic to.

None of this is exotic. It happens because every desk keeps its own copy of the truth. So we built one backend and one database, with three portals on top (Front Desk, Laboratory, Physician Workspace), plus a few safety gates that refuse to let the obvious mistakes through.

---

## See it first

| | |
|---|---|
| **Demo walkthrough** | [`DEMO.md`](DEMO.md): pitch-deck outline, a three-minute demo script and a judge checklist |
| **Demo video** | [`demo_video.mp4`](demo_video.mp4): Three-minute video walkthrough of CareWeave |
| **Pitch deck & script** | [`DEMO.md`](DEMO.md): Complete pitch-deck outline, demo script, and judge checklist |
| **Live site** | Frontend on Vercel, API on Render (configured in [`vercel.json`](vercel.json)) |

> **Tip for judges:** sign in as Front Desk or Doctor and press **Load sample scenario (synthetic)** in the top bar. It creates the synthetic patient *Priya Raman* with a penicillin allergy, an encounter, released and pending lab results, and an outside-hospital report that has been imported three times (clean, duplicate, conflicting). It only runs once.

---

## What it does

### 1. Multimodal diagnostic report scanner (Gemma 4)
- Technicians upload a PDF or a photo of a messy lab report and the AI reads the printed values into structured fields.
- Uses Google **Gemma 4** (`gemma-4-26b-a4b-it` / `gemma-4-31b-it` via the Gemini API), with automatic exponential backoff.
- **Maker-checker integrity:** scanned data is saved as a **draft only**. The AI can never publish to a patient's legal chart without a person signing off.
- **Physiological guardrails:** impossible values are rejected automatically (negative glucose, hemoglobin above 25 g/dL, potassium above 12 mmol/L).

### 2. Physician workspace and e-prescribing
- Typeahead search over a **94,000-drug catalogue** (`BrandMaster.tsv`) with instant brand-to-generic resolution.
- **Allergy guard:** drug families are checked, so prescribing Amoxicillin to a patient with a documented Penicillin allergy is blocked until the doctor documents an override reason. Every blocked attempt is audit-logged.
- Full encounters: SOAP notes, ICD-10 diagnosis tagging, care plans, referrals, and built-in calculators (ASCVD, eGFR, BMI).

### 3. Laboratory lifecycle with a second pair of eyes
- Status flow:
  `Requested` → `Collection Pending` → `Collected` → `Processing` → `Awaiting Verification` → `Verified` → `Released`
- The person who enters the values **cannot** verify them. A separate verifier (the pathologist account) signs off.
- Amendments require a written justification and stay in the audit trail.

### 4. Record reconciliation and concurrency
- **Deterministic patient matching:** external JSON or CSV records are scored with a weighted 70-point heuristic (UHID, DOB, phone, normalized name). Similar names alone never merge two people.
- **Conflict and duplicate detection:** the same report imported twice, or the same test with different values, is shown side by side with the evidence. Originals are preserved and nothing is overwritten silently.
- **Optimistic concurrency:** revision locks (`rev`) stop two staff members from silently overwriting each other's edits.

### 5. Healthcare Analytics on Exasol Personal
- **Hospital Operations:** daily visits with a 7-day moving average (an Exasol window function), department workload, and waiting time (check-in to start of consultation, measured only where both moments were recorded).
- **Diagnostic Turnaround Time:** ordered to verified, per test, with average, 90th percentile (`PERCENTILE_CONT`) and SLA compliance. Orders that are not verified yet have **no** turnaround and are counted as pending, never as finished. A second view shows where the time goes (order to collection, collection to verification).
- **Pharmacy:** estimated units per medicine (doses per day times course days) and a 30-day **demand estimate**. Stock on hand is not recorded, so no stock-out is predicted.
- **Honest sourcing:** the page states whether figures were computed by Exasol or, when Exasol is unreachable, by the application itself. A failed sync is reported as a failure. A successful sync means the rows were loaded and counted back from Exasol.
- **SQL Inspector:** shows the exact SQL behind the dashboard with the rows returned and the milliseconds Exasol took, from the request that loaded the page.
- **Reproducible demo data:** "Load 30-day sample history" adds a fixed-seed, clearly synthetic history (about 900 records) to the analytics only; it is kept apart from the records the portals show and is disclosed on the page.

Setup and the exact table design are in [`EXASOL_SETUP.md`](EXASOL_SETUP.md).

---

## How the pieces fit

```
  Front Desk ─┐
  Laboratory ─┼──►  Express API (roles, validation, audit log)  ──►  MongoDB (OLTP)
  Doctor ─────┘            │                                            │
                           ├── Gemma 4 / Gemini (report scan)           ▼ (Sync)
                           ├── Matching + reconciliation       Exasol Personal (OLAP)
                           └── Analytics Engine ◄───────────────────────┘
```

- One React app serves all three portals. Routes are guarded in the UI for convenience only; **the server checks the role on every request.**
- Every sensitive action (create, amend, release, blocked prescription) is written to an audit log.
- Roles are intentionally narrow: the front desk does not see lab values or clinical notes, and lab staff do not prescribe.

---

## Tech stack

| Layer | What we used |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Lucide icons, Recharts |
| Backend | Node.js, Express, TypeScript, Zod validation |
| OLTP Database | MongoDB Atlas (Cloud Cluster) |
| OLAP Analytics | **Exasol Personal** (In-Memory Columnar Engine via `@exasol/exasol-driver-ts`) |
| AI Vision | Google Gemma 4 via Interactions API, falling back to Gemini Flash |
| Auth | Firebase Authentication, plus optional local demo sign-in for development |
| Tests | Vitest and React Testing Library on the client, `tsx --test` on the server |

---

## Project layout

```
careweave/
├── client/            React app (all three portals live under src/portals)
│   └── src/
│       ├── auth/        login, role guard, session
│       ├── portals/
│       │   ├── receptionist/
│       │   ├── lab/
│       │   └── doctor/
│       └── components/  shared bits (e.g. the sample-scenario button)
├── server/
│   ├── src/           API, models, lab rules, reconciliation, AI scan routes
│   ├── scripts/       acceptance tests, medicine catalogue import
│   └── data/          local data file
└── DEMO.md            three-minute demo script
vercel.json            frontend build and API rewrite for deployment
```

---

## Run it locally

### What you need
- Node.js v20+
- MongoDB, either running locally (`mongodb://127.0.0.1:27017`) or a MongoDB Atlas connection string

### 1. Clone the repo
```bash
git clone https://github.com/Suriya29-2006/Hacktoberfest.git
cd Hacktoberfest/careweave
```

### 2. Set up the server
```bash
cd server
cp .env.example .env
npm install
```
Open `.env` and check the MongoDB URI. Add a `GEMINI_API_KEY` if you want live report scanning (optional; everything else works without it).

### 3. Start the server
```bash
npm run dev
# API on http://localhost:4000
```

### 4. Start the client
In a second terminal:
```bash
cd careweave/client
npm install
npm run dev
# App on http://localhost:5173
```

You can quickly confirm the API is up at `http://localhost:4000/api/health`.

---

## Demo accounts

Sign in at `http://localhost:5173/login`. The password for all of them is `demo123`.

| Portal / role | Email | What to try |
| :--- | :--- | :--- |
| **Front Desk** | `reception@careweave.test` | Patient check-in, live queue, walk-in appointments |
| **Lab Technician** | `lab@careweave.test` | Scan a report, collect specimens, enter results |
| **Pathologist** | `pathologist@careweave.test` | Verify and release pending results, review amendments |
| **Doctor** | `doctor@careweave.test` | Chart review, SOAP notes, e-prescribing, lab orders, external record review |

Local sign-in is on when `ALLOW_LOCAL_LOGIN=true` or when Firebase is not configured. On a real deployment, turn the sample data off with `ALLOW_SAMPLE_DATA=false`.

---

## Running the tests

```bash
# Server acceptance checks (starts an isolated test server and runs about 100 clinical rules)
cd careweave/server
npm run test:acceptance

# Server unit tests (physiological bounds, schema validation, medicine parser)
npm test

# Exasol analytics: loads synthetic rows into a throwaway schema and checks that
# the SQL on Exasol and the same metrics computed in code agree (skips if Exasol is not running)
cd ../server
npm run test:exasol

# Exasol at scale: 5 million synthetic visit rows generated inside Exasol, then the dashboard's kinds of queries timed
npm run demo:scale

# Frontend tests
cd ../client
npm test
```

---

## Deployment

The frontend is a static Vite build; the API is a Node/Express server. They can be hosted separately.

1. **API (any Node host, for example Render):** root directory `careweave/server`, build `npm install`, start `npm start` (it listens on `PORT`). Set the environment variables from [`.env.example`](.env.example): at least `MONGODB_URI`, `MONGODB_DB`, `CLIENT_ORIGIN` (the frontend's URL), and `FIREBASE_PROJECT_ID` or `ALLOW_LOCAL_LOGIN=true`. `GEMINI_API_KEY` is only needed for report scanning. Set `ALLOW_SAMPLE_DATA=false` for anything other than a demo.
2. **Frontend (Vercel):** the repository root has a [`vercel.json`](vercel.json) that builds `careweave/client` and rewrites `/api/*` to the API. Point that rewrite at your API's URL, or import the repo into Vercel and set the same project settings.
3. **Check it:** open `<api-url>/api/health`; it should report `"atlasConnected": true`.

**Exasol is not part of the hosted deployment.** Exasol Personal runs on your own machine (default `localhost:8563`), which a hosted API cannot reach. A hosted copy therefore shows the analytics page with the amber "Not computed by Exasol" banner, which is the intended honest behaviour. To demonstrate Exasol, run the project locally with Exasol running ([`EXASOL_SETUP.md`](EXASOL_SETUP.md)), or point `EXASOL_HOST` at an Exasol instance the API can reach.

---

## Troubleshooting

- **Login works but data looks empty:** check that the server is connected to the database you expect. `/api/health` tells you whether MongoDB Atlas is connected.
- **Report scanning fails or says the model is busy:** the scanner needs a `GEMINI_API_KEY` with quota. Without one, the rest of the app still works.
- **Atlas connection errors:** make sure your IP is on the Atlas Network Access list and outbound port 27017 is open, or switch to local MongoDB.
- **"Load sample scenario" does nothing:** it only runs once per database, and it is switched off if `ALLOW_SAMPLE_DATA=false`.

---

## Known limitations

We would rather say these out loud than have you find them:

- PDF import for external records is not built yet; JSON and CSV work.
- Gemma/Gemini scanning needs an API key with quota, and scanned results are drafts that a person must check.
- Analytics assumptions you should know: a visit's department is inferred from its stated reason; the lab SLA targets (routine 120 min, urgent 45 min) are configurable assumptions (`LAB_SLA_ROUTINE_MINUTES`, `LAB_SLA_URGENT_MINUTES`); prescription quantities are estimated from dose frequency and course length because dispensing is not recorded; there is no stock data, so there is no stock-out prediction.
- Waiting time exists only for visits that were moved to "In Consultation" after check-in. Visits without both moments are left out of averages, and the page counts them.
- The Exasol analytics tables are a copy: press **Sync to Exasol** to refresh them. Safety counts (allergy and duplicate-therapy blocks, maker-checker blocks) come from the application's audit trail.
- This is a demonstration build with synthetic data. We make no claims about clinical accuracy, regulatory compliance, or real hospital interoperability.

-
---

## License

MIT. See [`LICENSE`](LICENSE).
