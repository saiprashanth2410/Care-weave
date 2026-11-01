# CareWeave 🏥
### Unified Clinical Records & In-Memory Healthcare Intelligence Engine

> **Official Submission for ExaThon India 2026**  
> **Track / Challenge:** HealthTech — *From Siloed Hospital Desks to Unified Patient Health Records & Real-Time Operational Intelligence*  
> **Team:** Saiprashanth T, Suriya Sudhakar, Dhivya Dharshini C S  
> **Repository:** [https://github.com/saiprashanth2410/Care-weave](https://github.com/saiprashanth2410/Care-weave)  

---

[![Analytics: Exasol Personal](https://img.shields.io/badge/Analytics-Exasol_Personal_In--Memory-blueviolet.svg?style=for-the-badge&logo=database)](EXASOL_SETUP.md)
[![AI Vision: Google Gemma 4](https://img.shields.io/badge/Vision_AI-Gemma_4-blue.svg?style=for-the-badge&logo=google)](https://ai.google.dev/)
[![Messaging: WhatsApp & n8n](https://img.shields.io/badge/Messaging-WhatsApp_&_n8n-25D366.svg?style=for-the-badge&logo=whatsapp)](careweave/n8n/README.md)
[![Database: MongoDB Atlas](https://img.shields.io/badge/OLTP-MongoDB_Atlas-47A248.svg?style=for-the-badge&logo=mongodb)](https://www.mongodb.com/atlas)
[![Frontend: React 19](https://img.shields.io/badge/Frontend-React_19_TypeScript-61DAFB.svg?style=for-the-badge&logo=react)](careweave/client)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)

---

## ⚡ Executive Summary for Hackathon Judges

In typical community hospitals and diagnostic centers, **Front Desk (OPD)**, **Diagnostic Labs**, and **Doctor Consultation Rooms** operate in completely disconnected silos. Patients carry crumpled paper slips, lab values are manually re-typed (risking fatal decimal shift errors), doctors prescribe without allergy awareness, and administrators have zero real-time visibility into operational bottlenecks.

**CareWeave** solves this with a **Dual-Database HTAP Architecture (Hybrid Transactional/Analytical Processing)**:
1. **Low-Latency Operational Backbone (OLTP - MongoDB Atlas):** One single shared source of truth serving Front Desk, Laboratory, and Physician workspaces with strict optimistic concurrency locks and audit trails.
2. **Sub-Second In-Memory Analytics (OLAP - Exasol Personal):** High-performance columnar engine executing window functions, `PERCENTILE_CONT`, and multi-dimensional aggregations across outpatient queues, diagnostic turnaround times (TAT), and pharmacy consumption velocity.
3. **Multimodal Agentic AI (Google Gemma 4):** Reads crumpled physical lab reports into structured data with strict **Maker-Checker** human pathologist sign-off.
4. **Drug Safety Guardrails:** Instant brand-to-molecule resolution over a **94,000-drug formulary** with automated cross-brand allergy blocks and duplicate therapy interception.
5. **Omnichannel Patient Engagement (WhatsApp + n8n):** Real-time automated WhatsApp alerts (OP token updates, wait times, lab results, medication schedules) driven by n8n event pipelines and Twilio/Meta APIs.

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

## 🏗️ System Architecture: Dual-Database (HTAP) Strategy

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                CareWeave HTAP Architecture                             │
└────────────────────────────────────────────────────────────────────────────────────────┘

 [Receptionist Portal]         [Laboratory Portal]           [Physician Workspace]
  • Patient Registration        • Specimen Lifecycle          • SOAP Encounter Notes
  • Live OP Queue & Tokens      • Gemma 4 Report Scanner      • 94k Formulary E-Prescribing
  • Appointment Matrix          • Maker-Checker Verification  • Allergy & Duplicate Interceptor
           │                              │                             │
           └──────────────────────────────┼─────────────────────────────┘
                                          ▼
                         ┌─────────────────────────────────┐
                         │   CareWeave Express Server      │
                         │   (Zod Validation, RBAC, Audit) │
                         └──────────────┬──────────────────┘
                                        │
           ┌────────────────────────────┴──────────────────────────┐
           ▼ (OLTP - High-Throughput CRUD)                         ▼ (Async Event Webhook)
┌───────────────────────────────────────┐             ┌──────────────────────────────────┐
│             MongoDB Atlas             │             │           n8n Engine             │
│   Atomic Records, Encounters, Audit   │             │   Workflow Automation Router     │
└──────────────────┬────────────────────┘             └────────────────┬─────────────────┘
                   │                                                   │
                   │ (Idempotent MERGE Pipeline)                       ▼
                   ▼                                     ┌───────────────────────────────┐
┌───────────────────────────────────────┐                │   WhatsApp Cloud / Twilio     │
│       Exasol Personal (In-Memory)     │                │   Live Token, Meds & Lab Push │
│  Columnar Engine on port 8563         │                └───────────────────────────────┘
│  • Windowed Moving Averages           │
│  • Diagnostic Turnaround Time (TAT)   │
│  • Pharmacy Velocity & Safety Metrics │
└──────────────────┬────────────────────┘
                   ▼
┌───────────────────────────────────────┐
│     CareWeave Intelligence Portal     │
│   Interactive Charts + SQL Inspector  │
└───────────────────────────────────────┘
```

---

## 💎 Exasol Personal: In-Memory Healthcare Intelligence

Exasol Personal powers the **Executive Intelligence Dashboard** (`/analytics`) providing hospital administrators with sub-millisecond visibility across three operational pillars:

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

### 5. High-Scale Benchmark (5,000,000 Records)
Exasol Personal was benchmarked against **5 million synthetic visit records** generated directly in-database (`npm run demo:scale`). Complex window aggregations across the entire 5M row dataset completed in **under 180 milliseconds**, proving enterprise readiness.

---

## 🛡️ Clinical Safety & Core Platform Features

### 1. Multimodal Diagnostic Scanner (Google Gemma 4)
- Uploads crumpled paper lab slips, invoices, or outside diagnostic PDFs.
- Gemma 4 extracts parameters, numerical values, units, and reference ranges.
- **Maker-Checker Security:** AI output is saved strictly as an unverified draft; clinical values can never touch a patient chart without human verifier sign-off.
- **Physiological Bounds Interceptor:** Blocks physiologically impossible inputs (e.g., negative blood glucose, hemoglobin > 25 g/dL, potassium > 12 mmol/L).

### 2. Physician Workspace & E-Prescribing
- **94,000-Drug Formulary:** Instant brand-to-molecule mapping (`BrandMaster.tsv`).
- **Allergy Family Conflict Interception:** Prescribing Amoxicillin to a patient with a Penicillin allergy is blocked. Overriding requires a documented medical justification and triggers an audit log.
- **Duplicate Molecule Interceptor:** Blocks accidental therapeutic doubling across different brand names (e.g., Augmentin + Moxikind-CV, or Calpol + Ultracet).

### 3. Record Reconciliation (Deterministic 70-Point Algorithm)
- Outside medical records (JSON/CSV) are scored on a weighted 70-point heuristic: UHID (50 pts), DOB (25 pts), Phone (20 pts), Exact/Similar Name (20/10 pts).
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
| **Backend API** | Node.js (v20+), Express, TypeScript, Zod Schema Validation |
| **OLTP Database** | MongoDB Atlas (Cloud Cluster) with in-memory fallback |
| **OLAP Analytics** | **Exasol Personal** (In-Memory Columnar Database via `@exasol/exasol-driver-ts`) |
| **AI Vision** | Google Gemma 4 (`gemma-4-26b-a4b-it`) via Gemini API Interactions |
| **Automation** | n8n Workflow Automation, Webhooks, Twilio WhatsApp API, Meta Cloud API |
| **Security & Auth** | Firebase Authentication, SHA-256 Hashed Sessions, Role-Based Access Control, Helmet |

---

## 🚀 Quickstart: Running CareWeave Locally

### Prerequisites
- **Node.js:** v20+
- **MongoDB:** Local instance (`mongodb://127.0.0.1:27017`) or MongoDB Atlas URI
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

## 🧪 Comprehensive Verification & Test Suites

```bash
# 1. Run all unit tests (Physiological bounds, schemas, medicine parser, WhatsApp bot)
cd careweave/server && npm test

# 2. Run Exasol parity tests (Verifies SQL calculations against code logic)
cd careweave/server && npm run test:exasol

# 3. Run Exasol 5-Million Row scale benchmark
cd careweave/server && npm run demo:scale

# 4. Run clinical acceptance suite (100+ clinical & concurrency safety checks)
cd careweave/server && npm run test:acceptance

# 5. Run client component tests
cd careweave/client && npm test
```

---

## 📜 Ethical Disclosures & Synthetic Data Notice
CareWeave is a demonstration prototype engineered for **ExaThon India 2026**. All clinical scenarios, patient identifiers (*Priya Raman*, *Asha Rao*), appointments, and laboratory observations are **100% synthetic**. The system functions as a clinical decision support and hospital analytics engine; it does not replace professional diagnostic judgment.

---

## 📄 License
This project is open-source under the [MIT License](LICENSE).  
Copyright (c) 2026 Saiprashanth T, Suriya Sudhakar, Dhivya Dharshini C S.
