# CareWeave — Monorepo Architecture & Service Guide

> **Core engine of CareWeave**  
> Main Presentation & Documentation: [Root README.md](../README.md)  
> Exasol Analytics Setup & Architecture: [EXASOL_SETUP.md](../EXASOL_SETUP.md)  
> 5-Minute Video Walkthrough: [`CareWeave_Demo_5min.mp4`](../CareWeave_Demo_5min.mp4)  
> Presentation Deck: [`CareWeave.pptx`](../CareWeave.pptx)  
> Live demo: https://careweave-ten.vercel.app  

---

## 🏛️ System Status

| Component | Architecture & Status | Details |
| :--- | :--- | :--- |
| **Front Desk Portal** | Built & Server-backed | Patient registration, live OP waitlist queue, token printer |
| **Laboratory Portal** | Built & Server-backed | Specimen collection, Gemma 4 AI scanner, maker-checker verification |
| **Doctor Portal** | Built & Server-backed | SOAP encounters, 94k formulary prescribing, allergy & duplicate blocks |
| **Exasol Analytics** | Built & Integrated | TAT audit, percentiles (`PERCENTILE_CONT`), moving averages. `MERGE` sync (button, or scheduled when configured), incremental after the first run; no timing claimed |
| **WhatsApp Patient Bot & n8n** | Built & Integrated | Event-driven token push, live queue status, prescription schedules |
| **Record Reconciliation** | Built & Server-backed | Deterministic 70-point heuristic scoring, conflict side-by-side view |

---

## 🚀 Running the Services

Requires **Node.js 20+**, **MongoDB**, and optionally **Exasol Personal** (port 8563):

```bash
# Terminal 1: Backend API (port 4000)
cd server
cp .env.example .env
npm install
npm run dev

# Terminal 2: React 19 Frontend (port 5173)
cd client
npm install
npm run dev
```

Open **`http://localhost:5173/login`**.

### Default Demo Credentials:
Password for all accounts: **`demo123`**

| Role | Email |
| :--- | :--- |
| **Front Desk** | `reception@careweave.test` |
| **Lab Technician** | `lab@careweave.test` |
| **Pathologist (Verifier)** | `pathologist@careweave.test` |
| **Doctor** | `doctor@careweave.test` |

---

## 🧪 Running Test Suites

```bash
cd server
npm test                 # Unit + integration tests (rules, WhatsApp, 409 conflicts, sessions, webhook signature)
npm run test:exasol      # Exasol analytics parity checks (needs Exasol)
npm run demo:scale       # Scale benchmark on Exasol Personal (needs Exasol; prints its own timings)
npm run test:acceptance  # End-to-end acceptance checks against MongoDB (102)

cd ../client
npm test                 # React component & Vitest suites
```

---

## 📄 License
MIT License. See [LICENSE](../LICENSE).
