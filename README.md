# CareWeave 🏥

> A multi-role EHR & clinical diagnostic platform built to solve messy hospital paper trails, fragmented patient records, and dangerous prescription conflicts.

[![Hacktoberfest 2026](https://img.shields.io/badge/Hacktoberfest-2026-orange.svg)](https://hacktoberfest.com/)
[![Built with Gemma 4](https://img.shields.io/badge/Vision_AI-Gemma_4-blue.svg)](https://ai.google.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## Why We Built This

In most community hospitals and diagnostic labs, records are trapped in silos:
- Patients walk in with crumpled paper lab slips from external labs.
- Receptionists and lab technicians re-type lab values by hand, leading to dangerous typos (e.g., misplacing a decimal or entering impossible numbers).
- Doctors prescribe medications without visibility into external clinical records or cross-reactive allergies.

We built **CareWeave** as a unified, full-stack clinical operations hub with three synchronized portals (Front Desk, Laboratory, and Physician Workspace) backed by open-weight multimodal AI and strict medical safety gates.

---

## Key Features

### 1. 🩻 Multimodal Diagnostic Document Scanner (Gemma 4)
* **Real OCR to Telemetry**: Technicians can upload PDFs or photos of messy diagnostic reports. 
* **Powered by Open-Weights**: Uses **Google Gemma 4** (`gemma-4-26b-a4b-it` / `gemma-4-31b-it` via Gemini API) with automatic exponential backoff.
* **Maker-Checker Integrity**: Scanned data is strictly saved as a **draft**. The AI can never publish results directly to a patient's legal chart without human pathologist sign-off.
* **Physiological Range Guardrails**: Automatically rejects biologically impossible values (e.g., negative glucose, hemoglobin > 25 g/dL, or potassium > 12 mmol/L).

### 2. 🩺 Physician Workspace & E-Prescribing
* **94,000-Drug Catalogue**: Integrated typeahead search over `BrandMaster.tsv` with instant brand-to-generic resolution.
* **Cross-Allergy Hard Blocks**: Checks drug families (e.g., hard-blocking Amoxicillin when a patient has a documented Penicillin allergy).
* **Complete Clinical Encounters**: Dedicated SOAP documentation, ICD-10 diagnosis tagging, care plan scheduling, and built-in clinical calculators (ASCVD, eGFR, BMI).

### 3. 🔬 6-Stage Laboratory Lifecycle
* Strict regulatory status progression:  
  `Requested` $\rightarrow$ `Collection Pending` $\rightarrow$ `Collected` $\rightarrow$ `Processing` $\rightarrow$ `Awaiting Verification` $\rightarrow$ `Verified` $\rightarrow$ `Released`.
* Independent verifier requirements (the technician who enters the values cannot verify them).
* Full audit trail on amendments with mandatory written clinical justifications.

### 4. 🗂️ Record Reconciliation & Concurrency
* **Deterministic Matching**: Ingests external JSON/CSV patient records using a weighted 70-point heuristic (UHID, DOB, phone, normalized name).
* **Conflict Detection**: Flags duplicate therapies and mismatched lab intervals side-by-side.
* **Optimistic Concurrency**: Uses revision locks (`rev`) to prevent silent overwrite races when multiple staff members update the same patient.

---

## Tech Stack

* **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons.
* **Backend**: Node.js, Express, TypeScript, Zod schema validation.
* **Database**: MongoDB (Atlas or local `mongod`).
* **AI Model**: Google Gemma 4 (Interactions API) with fallback to Gemini Flash.
* **Testing**: 100+ automated end-to-end acceptance tests, Vitest, React Testing Library.

---

## Quick Start (Run Locally in 2 Minutes)

### Prerequisites
* Node.js v20+
* MongoDB running locally (`mongodb://127.0.0.1:27017`) or a MongoDB Atlas URI

### 1. Clone the repository
```bash
git clone https://github.com/Suriya29-2006/Hacktoberfest.git
cd Hacktoberfest/careweave
```

### 2. Configure the server
```bash
cd server
cp .env.example .env
npm install
```
*(Optional: Add your `GEMINI_API_KEY` to `server/.env` to enable live Gemma document vision).*

### 3. Start the server
```bash
npm run dev
# API running on http://localhost:4000
```

### 4. Start the client
In a second terminal window:
```bash
cd careweave/client
npm install
npm run dev
# App running on http://localhost:5173
```

---

## Demo Accounts

Sign in at `http://localhost:5173/login`:

| Portal / Role | Email | Password | What to Test |
| :--- | :--- | :--- | :--- |
| **Front Desk** | `reception@careweave.test` | `demo123` | Patient check-in, queue triage, walk-in appointments |
| **Lab Technician** | `lab@careweave.test` | `demo123` | Upload a report scan, specimen collection, result entry |
| **Pathologist** | `pathologist@careweave.test` | `demo123` | Verify & release pending results, audit amendments |
| **Doctor** | `doctor@careweave.test` | `demo123` | Chart review, SOAP notes, e-prescribing, lab orders |

> **Tip for Judges**: Once logged in as Front Desk or Doctor, click **"Load sample scenario"** to instantly generate synthetic patient *Priya Raman* with complete medical history, lab orders, and active prescriptions.

---

## Running the Automated Test Suite

CareWeave includes rigorous automated safety checks:

```bash
# Run server acceptance tests (starts isolated ephemeral test server & checks ~100 clinical rules)
cd careweave/server
npm run test:acceptance

# Run unit tests (physiological bounds, Zod schema validation, medicine parser)
npm test

# Run frontend tests (Vitest + React Testing Library)
cd ../client
npm test
```

---

## Prize Track Alignment

* **Best Use of Gemma**: Features deep integration with multimodal **Gemma 4** (`gemma-4-26b-a4b-it`) to parse unstructured diagnostic reports into structured clinical JSON.
* **Best Open-Source AI Project (DigitalOcean)**: Built entirely with open-weight models (Gemma) and an open-source stack (Node/React/Mongo) capable of being self-hosted on a privacy-first DigitalOcean Droplet without patient data lock-in.

---

## License

This project is licensed under the [MIT License](LICENSE).
