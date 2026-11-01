# CareWeave 🏥
### Unified Clinical Records & Hospital Operations Analytics

> **Official Submission for ExaThon India 2026**  
> **Track / Challenge:** HealthTech — *From Siloed Hospital Desks to Unified Patient Health Records & Real-Time Operational Intelligence*  
> **Team:** Saiprashanth T, Suriya Sudhakar, Dhivya Dharshini C S  
> **Repository:** [https://github.com/saiprashanth2410/Care-weave](https://github.com/saiprashanth2410/Care-weave)  

> ⚠️ **Clinical safety checks are decision support for a hackathon prototype, not validated medical software.** All data in this repository is synthetic.

---

[![Analytics: Exasol Personal](https://img.shields.io/badge/Analytics-Exasol_Personal-blueviolet.svg?style=for-the-badge&logo=database)](EXASOL_SETUP.md)
[![AI Vision: Google Gemma 4](https://img.shields.io/badge/Vision_AI-Gemma_4-blue.svg?style=for-the-badge&logo=google)](https://ai.google.dev/)
[![Messaging: WhatsApp & n8n](https://img.shields.io/badge/Messaging-WhatsApp_&_n8n-25D366.svg?style=for-the-badge&logo=whatsapp)](careweave/n8n/README.md)
[![Database: MongoDB Atlas](https://img.shields.io/badge/OLTP-MongoDB-47A248.svg?style=for-the-badge&logo=mongodb)](https://www.mongodb.com/atlas)
[![Frontend: React 19](https://img.shields.io/badge/Frontend-React_19_TypeScript-61DAFB.svg?style=for-the-badge&logo=react)](careweave/client)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)

---

## ⚡ Executive Summary for Hackathon Judges

In typical community hospitals and diagnostic centers, **Front Desk (OPD)**, **Diagnostic Labs**, and **Doctor Consultation Rooms** operate in completely disconnected silos. Patients carry crumpled paper slips, lab values are manually re-typed (risking fatal decimal shift errors), doctors prescribe without allergy awareness, and administrators have zero real-time visibility into operational bottlenecks.

**CareWeave** puts the three desks on one shared record and adds an analytics layer: **OLTP (MongoDB) + OLAP (Exasol) with an on-demand MERGE sync**.
1. **Operational store (OLTP, MongoDB):** One shared source of truth for the Front Desk, Laboratory and Physician workspaces. Every request reads and writes MongoDB directly; the server keeps no copy of the data. Patients, encounters, lab orders, appointments and prescriptions carry a `version`, and a write made from an out-of-date copy is refused with HTTP 409 (see [Data consistency](#-data-consistency-exactly-what-is-implemented)). Every action is written to an audit log.
2. **Analytics (OLAP, Exasol Personal):** A columnar engine runs window functions, `PERCENTILE_CONT` and aggregations over outpatient queues, diagnostic turnaround times (TAT) and prescribing volume. Data reaches Exasol when someone presses **Sync to Exasol** on the analytics page, which runs an idempotent `MERGE`; nothing syncs by itself. If Exasol is offline the page says so and shows figures computed by the application instead.
3. **Multimodal AI (Google Gemma 4):** Reads photographed lab reports into structured rows. The output is a draft; a second person with verification permission must sign it off (maker-checker).
4. **Drug safety checks:** Brand-to-molecule lookup over a 93,911-row brand catalogue, an allergy check against a short hand-written list of drug families (penicillins, sulfonamides, NSAIDs, cephalosporins; anything else is matched by name only), duplicate-molecule detection across brands, and a 12-pair drug-drug interaction list.
5. **WhatsApp (n8n, Twilio, Meta):** Event pushes (OP token, lab report released, prescription) and two-way keywords. Meta webhook calls are accepted only with a valid `X-Hub-Signature-256`.

---

## 🧭 Fast Navigation for Judges & Evaluators

| Resource | Description | Direct Link |
| :--- | :--- | :--- |
| 🎬 **Demo Video** | 3-Minute end-to-end video walkthrough of CareWeave | [`demo_video.mp4`](demo_video.mp4) |
| 📊 **Pitch Deck** | Official 10-slide presentation deck (ExaThon India 2026) | [`CareWeave.pptx`](CareWeave.pptx) |
| 📝 **Evaluation Guide & Script** | Slide-by-slide pitch narrative and judge evaluation checklist | [`DEMO.md`](DEMO.md) |
| 🏛️ **Exasol Integration Guide** | Comprehensive schema design, SQL queries, and scale benchmarks | [`EXASOL_SETUP.md`](EXASOL_SETUP.md) |
| 🤖 **WhatsApp & n8n Specs** | Event-driven notification workflow and two-way bot documentation | [`careweave/n8n/README.md`](careweave/n8n/README.md) |

> 💡 **Quick Evaluation Tip:** Log into the app, switch to **Doctor** or **Front Desk**, and click **"Load sample scenario (synthetic)"** in the top navigation bar. It creates synthetic patient *Priya Raman* with an encounter, penicillin allergy, lab orders, and conflicted external hospital imports ready for instant testing.

---

## 🏗️ System Architecture: OLTP + OLAP

Arrows show the real direction of each call. The browser never talks to MongoDB, Exasol or n8n directly.

```
 [Receptionist Portal]    [Laboratory Portal]    [Physician Workspace]    [Analytics page]
          └───────────────────┬───────────────────┬────────────────────────┘
                              │  HTTPS, Bearer session token
                              ▼
        ┌─────────────────────────────────────────────────────────────────┐
        │  CareWeave Express server (stateless: no data kept in process)  │
        │  middleware ─► routes/ ─► services/ ─► repo/                    │
        └──┬───────────────┬────────────────┬──────────────────┬──────────┘
           │ every read    │ on-demand      │ events           │ scanner
           │ and write     │ "Sync to       │ (HTTP POST)      │ upload
           ▼               │  Exasol"       ▼                  ▼
   ┌───────────────┐       │        ┌──────────────┐   ┌──────────────────┐
   │   MongoDB     │       │        │ n8n / Twilio │   │ Gemini API       │
   │  records,     │       │        │  ─► WhatsApp │   │ (Gemma 4 vision) │
   │  sessions,    │       │        └──────────────┘   └──────────────────┘
   │  audit log    │       │
   └───────┬───────┘       │        WhatsApp ─► Meta / Twilio ─► POST /api/whatsapp/inbound
           │ read whole    │                    (Meta calls need a valid X-Hub-Signature-256;
           │ collections   │                     n8n and Twilio calls need the shared key)
           ▼               ▼
   ┌────────────────────────────┐   MERGE (upsert) into fact tables
   │ sync.ts (inside the server)│ ─────────────────────────────────────►  ┌─────────────────┐
   └────────────────────────────┘                                          │ Exasol Personal │
                                                                           └────────┬────────┘
   Analytics page ─► server ─► SQL queries ◄───────────────────────────────────────┘
   (if Exasol is unreachable the server computes the same figures in code and labels them as such)
```

**Request path.** A request passes the CORS and body-size middleware, the session check (`sessions` collection), the role check, then a router in `server/src/routes/` (`auth`, `patients`, `appointments`, `lab`, `doctor`, `admin`). Routers call `services/` for rules that are not tied to HTTP and `repo/` for storage. `index.ts` only opens the database and starts the server; `app.ts` wires the middleware and routers.

**Storage modes** (the server logs which one is active at start-up):
- **MongoDB** when `MONGODB_URI` is set. A failed connection stops the server; it does not fall back to local files.
- **Local JSON file** (`server/data/careweave.json`) only when `MONGODB_URI` is unset, for single-process development. In production (`NODE_ENV=production` or Vercel) a missing `MONGODB_URI` is an error unless `ALLOW_LOCAL_STORE=true`. Sessions are kept in memory in this mode and are not written to the file.

---

## 🔒 Data consistency (exactly what is implemented)

- **Optimistic concurrency, five collections.** `patients`, `encounters`, `labOrders`, `appointments` and `prescriptions` have `version: number` (1 on insert; documents that predate the field are given 1 when the server starts, and the old `rev` counter is dropped). Every update is
  `updateOne({ id, version: expected }, { $set: changes, $inc: { version: 1 } })`. If it matches nothing, the repo throws `ConflictError` and the route answers **HTTP 409** `{ "error": "Record was changed by someone else, reload and retry" }`.
- **Which version is `expected`.** The client sends the version it last read (patient edit form, appointment actions, prescription stop, lab order updates). If it differs from the stored one the request is refused at once. If the client sent none, the version read at the start of the request is used, which still catches another instance writing between that read and this write.
- **What the client does on 409.** It shows "Someone else changed this record while you had it open. Reload the page to see the latest version, then try again." It does not retry or merge automatically.
- **Unique indexes** guard inserts: `id` on every collection, `patientId` on patients, and on appointments `slotKey` (one doctor, one slot), `patientKey` (one patient, one time) and `tokenKey` (one OP token per day), each set only while it applies.
- **Sessions** are documents `{ tokenHash, userId, expiresAt }` in the `sessions` collection. Only the SHA-256 of the token is stored. MongoDB removes expired documents with a TTL index, and every lookup also checks `expiresAt`. Logout deletes the document. Sessions last 8 hours.
- **Browser sign-in uses an httpOnly cookie.** The server sets `cw_session` (`HttpOnly; SameSite=Strict; Secure` in production) and the response body does not contain the token, so no page script can read it; the client stores nothing in `localStorage`. Because a cookie is sent automatically, every state-changing request from the browser must also carry an `X-CW-Session: cookie` header (a cross-site page cannot add it) or it gets 403. Scripts and tests can still sign in without that header, receive the token in the body and use `Authorization: Bearer`.
- **Rate limits are shared.** Login (10 attempts per 15 minutes per IP and email) and upload (20 per minute per user) counters are one atomic upsert per request in the `rateLimits` collection, so every instance and every restart sees the same count. If the database cannot be reached the request is refused with 503 (fail closed).
- **Not covered:** `users`, `vitals`, `referrals`, `carePlans`, `externalRecords`, review `cases` and `auditLogs` are written without a version check (last write wins). There are **no multi-document transactions**: for example saving an encounter with vitals is two inserts, and if the second fails the first stays.

---

## 💎 Exasol Personal: Healthcare Analytics

Exasol Personal powers the **Executive Intelligence Dashboard** (`/analytics`) providing hospital administrators with visibility across three operational areas:

### 1. Hospital Operations & Outpatient Flow
- **Daily Visits with 7-Day Moving Average:** Computed via Exasol window functions (`AVG(COUNT(*)) OVER (ORDER BY VISIT_DATE ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)`).
- **Departmental Workload & Patient Wait Time Funnel:** Measures true elapsed minutes from Front Desk check-in to consultation commencement (`STATUS = 'In Consultation'`).

### 2. Diagnostic Turnaround Time (TAT) & SLA Audit
- **End-to-End Specimen Auditing:** Tracks elapsed time from doctor order to pathologist release.
- **Parametric Percentiles (`PERCENTILE_CONT(0.90)`):** Audits 90th percentile TAT against priority SLAs (Routine: 120 mins, Urgent: 45 mins). In-progress tests are explicitly audited as pending.
- **Workflow Decomposition:** Isolates bottlenecks between Pre-analytical (Order → Collection) and Analytical (Collection → Verification) phases.

### 3. Pharmacy Consumption Velocity & Antimicrobial Safety
- **Velocity Forecasting:** Calculates aggregate unit demand (`doses_per_day * course_days`) extrapolated across 30-day horizons.
- **Safety Overrides Audit:** Aggregates intercepted cross-brand duplicate therapies and allergy override justifications directly from the clinical audit trail.

### 4. Full Transparency: In-App SQL Inspector
Every widget on the Analytics Dashboard features a live **SQL Inspector** button revealing:
- The exact ANSI SQL query dispatched to Exasol.
- Real-time query execution time in milliseconds.
- Exact row counts returned by the Exasol columnar engine.

### 5. Scale benchmark (not yet recorded)
`npm run demo:scale [rows]` generates synthetic visit rows **inside Exasol** (default 5,000,000, in a separate schema that is dropped afterwards), runs four analytical queries once cold and five times warm, and prints the row count plus client-side and server-side timings per query.

**No timing is quoted here.** Exasol was not running when this README was last revised, so the benchmark has not been run on this code and any figure would be invented. To record one, start Exasol, run `npm run demo:scale`, and add the printed table here together with the row count and the machine (CPU, RAM, and whether Exasol ran locally).

Separately, every analytics widget has a **SQL Inspector** that shows the exact SQL sent to Exasol, the rows returned and the time that single query took on that run.

---

## 🛡️ Clinical Safety Checks & Core Platform Features

> These checks are decision support for a hackathon prototype, not validated medical software. Their rules are small and hand-written (see [Known limitations](#-known-limitations)).

### 1. Multimodal Diagnostic Scanner (Google Gemma 4)
- Uploads crumpled paper lab slips, invoices, or outside diagnostic PDFs.
- Gemma 4 extracts parameters, numerical values, units, and reference ranges.
- **Maker-Checker Security:** AI output is saved strictly as an unverified draft; clinical values can never touch a patient chart without human verifier sign-off.
- **Plausibility check:** Rejects impossible values for a short list of analytes (glucose, haemoglobin, HbA1c, creatinine, potassium, sodium, cholesterol, triglycerides, bilirubin, pH) and negative values for analytes that cannot be negative. Other analytes are not range-checked.

### 2. Physician Workspace & E-Prescribing
- **Brand catalogue:** 93,911 brand rows with their generic composition (`server/catalog/BrandMaster.tsv`).
- **Allergy check:** Matches the allergen against the medicine name and against four hand-written drug families (penicillins, sulfonamides, NSAIDs, cephalosporins). Prescribing Amoxicillin to a patient with a penicillin allergy is blocked; an override needs a written reason (15+ characters) and is audited. Allergies outside those families are matched by name only.
- **Duplicate Molecule Interceptor:** Blocks accidental therapeutic doubling across different brand names (e.g., Augmentin + Moxikind-CV, or Calpol + Ultracet).

### 3. Record Reconciliation (rule-based scoring)
- Outside medical records (JSON) are scored: UHID 50, date of birth 25, phone 20, name 20 (exact) or 10 (similar), minus 20 for a conflicting date of birth. A record is linked automatically only when the UHID matches, one other field confirms it, nothing contradicts it and the score is at least 70. Everything else goes to a human reviewer.
- Conflicting reports and duplicate records are displayed in a side-by-side reconciliation workspace without destructive overwrites.

### 4. Omnichannel WhatsApp Bot & Simulator
- Automated event pushes: `PATIENT_CHECKED_IN`, `LAB_REPORT_RELEASED`, `PRESCRIPTION_PRESCRIBED`.
- Interactive two-way keywords:
  - `QUEUE` / `TOKEN` — Live queue position, assigned doctor, consultation room, and estimated wait.
  - `MEDS <UHID>` / `RX <UHID>` — Active medication schedule segmented by Morning, Afternoon, and Night.
  - `REPORT <UHID>` — Latest verified laboratory test parameters and critical flags.
  - Reports and medicines are private: they are shown only when the sender's phone number and the UHID belong to the same patient.
- Built-in **WhatsApp Simulator Widget** allows evaluators to simulate the entire WhatsApp experience directly inside the browser without needing third-party hardware.

### 5. Live Operations
- **Live sync:** a server-sent-events stream (`/api/events`) refreshes the front desk and doctor screens the moment anything changes. Where the host cannot hold a connection open (serverless), screens fall back to polling every 5 seconds.
- **Critical lab alerts:** when a verifier releases a result with a critical value, the ordering and linked doctors get a banner at once, and their Overview keeps it for 3 days.
- **Pre-consult brief:** one click on a patient chart summarises allergies, flagged labs, medicines and open items. It uses Gemma/Gemini when `GEMINI_API_KEY` is set (no name, phone or UHID is sent) and plain rules otherwise.

---

## 💻 Tech Stack Summary

| Layer | Technologies & Tools |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, Recharts |
| **Backend API** | Node.js (v20+), Express, TypeScript. Zod validates the scanner's model output; other request checks are hand-written |
| **OLTP Database** | MongoDB (Atlas or local) through `repo/`; a local JSON file is a development-only fallback |
| **OLAP Analytics** | **Exasol Personal** via `@exasol/exasol-driver-ts` |
| **AI Vision** | Google Gemma 4 (`gemma-4-26b-a4b-it`) via Gemini API Interactions |
| **Automation** | n8n Workflow Automation, Webhooks, Twilio WhatsApp API, Meta Cloud API |
| **Security & Auth** | Firebase Authentication, Sessions stored as SHA-256 hashes in MongoDB, Role-Based Access Control, Helmet |

---

## 🚀 Quickstart: Running CareWeave Locally

### Prerequisites
- **Node.js:** v20+
- **MongoDB:** Local instance (`mongodb://127.0.0.1:27017`) or MongoDB Atlas URI. Without `MONGODB_URI` the server uses a local JSON file (development only).
- **Exasol Personal:** Running on `localhost:8563` (See [`EXASOL_SETUP.md`](EXASOL_SETUP.md) for 2-minute install)

### 1. Clone & Install
```bash
git clone https://github.com/saiprashanth2410/Care-weave.git
cd Care-weave
```

### 2. Configure & Start Server
```bash
cd careweave/server
cp .env.example .env
npm install
npm run dev
# Server listening on http://localhost:4000
```

### 3. Start Client Application
In a separate terminal:
```bash
cd careweave/client
npm install
npm run dev
# Client app live at http://localhost:5173
```

---

## 👥 Demo Credentials (All Portals)

Sign in at **`http://localhost:5173/login`** using the credentials below (Password for all: `demo123`):

| Role / Portal | Email | Key Features to Test |
| :--- | :--- | :--- |
| **Receptionist** | `reception@careweave.test` | OP token generation, walk-in scheduling, live waitlist queue |
| **Laboratory** | `lab@careweave.test` | AI report scanning, specimen collection, result entry |
| **Pathologist** | `pathologist@careweave.test` | Result verification, amendment approvals, critical release |
| **Physician (Doctor)** | `doctor@careweave.test` | SOAP notes, 94k e-prescribing, allergy blocks, lab orders |
| **Executive Analytics** | *Any logged-in user* | Exasol intelligence dashboard, SQL inspector, TAT audit |

---

## 🧪 Verification

```bash
# 1. Unit and integration tests (rules, WhatsApp bot, 409 conflicts, sessions across two server instances, webhook signatures)
cd careweave/server && npm test
#    The conflict tests also run against MongoDB when one is reachable at CAREWEAVE_TEST_MONGODB_URI
#    (default mongodb://127.0.0.1:27017, a throwaway database); otherwise those cases are skipped.

# 2. End-to-end acceptance suite against a real MongoDB (102 checks, throwaway database careweave_test)
cd careweave/server && MONGODB_URI=mongodb://127.0.0.1:27017 npm run test:acceptance

# 3. Exasol parity: SQL results equal the same metrics computed in code; sync is idempotent (needs Exasol)
cd careweave/server && npm run test:exasol

# 4. Exasol scale benchmark (needs Exasol; see "Scale benchmark" above)
cd careweave/server && npm run demo:scale

# 5. Client tests
cd careweave/client && npm test
```

---

## ☁️ Deployment notes (Vercel)

- `vercel.json` builds the server (`tsc` into `careweave/server/dist`, which is **not** committed) and then the client; `api/index.ts` imports the built server.
- Required: `MONGODB_URI` (the server refuses to start in production without it). Several instances can run at once because sessions and data are in MongoDB.
- WhatsApp: set `META_APP_SECRET` (Meta app secret, used to verify `X-Hub-Signature-256`; without it production refuses Meta webhook calls), `META_VERIFY_TOKEN` for the one-time handshake, and `WHATSAPP_API_KEY` for n8n and Twilio calls.
- Lab report attachments are written to the instance's local disk (`/tmp` on Vercel), so they are not shared between instances or kept across restarts.

---

## ⚠️ Known limitations

Still true after the changes above:

- **Rate limiter fails closed.** If MongoDB cannot be reached the limited routes (sign-in, upload) answer 503. In the local-file development mode its counters are in memory.
- **XSS is reduced, not removed.** The httpOnly cookie keeps the token out of reach of scripts, but a script injected into the page could still make requests as the signed-in user while the page is open. A Content-Security-Policy (no inline or third-party scripts; `vercel.json` for the pages, Helmet for the API, also on Vercel) makes injection harder. It was written without a browser test of every screen, so check the sign-in and print flows after deploying.
- **Clinical rules are demo-grade.** The allergy check knows four drug families; the plausibility check covers about ten analytes; the drug-drug interaction check is a hand-written matrix of 12 drug pairs (`DRUG_INTERACTIONS` in `server/src/safety/molecules.ts`), so most real interactions are not detected; the duplicate-therapy check depends on the brand catalogue's composition text; reconciliation scoring is a fixed point scheme. None of it has been clinically validated.
- **No multi-document transactions.** Operations that write several documents (encounter + vitals, import + review cases, sample scenario) can stop half-way if the database fails between writes.
- **Optimistic concurrency covers five collections only.** Referrals, care plans, vitals, external records, review cases and users are last-write-wins.
- **OP token numbers can skip.** The next token is counted from existing tokens and a unique per-day `tokenKey` rejects a duplicate; the loser of a race counts again (up to 5 tries). Numbers are not reused or renumbered.
- **Double booking of a patient is guarded only while the booking is active** (unique `patientKey`, same rule as the doctor slot). Appointments created before this key existed are not covered until they are rebooked.
- **Analytics sync is manual** (button on the analytics page) and reads whole collections. The overview, when Exasol is offline, also computes over whole collections. Neither is designed for a large hospital.
- **WhatsApp language preference** (`LANG TA/EN`) is stored per phone number in the `whatsappPrefs` collection, so it survives restarts and is shared by instances. It is never cleared.
- **Attachments live on local disk** (see Deployment notes).
- **Live updates** use server-sent events held in one process: a change made on one instance only pushes to screens connected to that instance; the screens also poll every 5 seconds. On Vercel only polling is used.
- **Sample data:** the "sample scenario" and 30-day analytics history are synthetic and generated by the app.
- **Not benchmarked:** no performance figure is claimed anywhere in this repository. `npm run demo:scale` exists but its results have not been recorded.
- **Not a medical device.** No regulatory review, no security audit, no penetration test.

---

## 📜 Ethical Disclosures & Synthetic Data Notice
CareWeave is a demonstration prototype engineered for **ExaThon India 2026**. All clinical scenarios, patient identifiers (*Priya Raman*, *Asha Rao*), appointments, and laboratory observations are **100% synthetic**. **Clinical safety checks are decision support for a hackathon prototype, not validated medical software.** The system does not replace professional diagnostic judgment.

---

## 📄 License
This project is open-source under the [MIT License](LICENSE).  
Copyright (c) 2026 Saiprashanth T, Suriya Sudhakar, Dhivya Dharshini C S.
