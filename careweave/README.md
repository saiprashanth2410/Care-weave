# CareWeave — Monorepo Architecture & Service Guide

> **Core Engine of CareWeave — ExaThon India 2026 Submission**  
> Main Presentation & Documentation: [Root README.md](../README.md)  
> Exasol Analytics Setup & Architecture: [EXASOL_SETUP.md](../EXASOL_SETUP.md)  
> 3-Minute Video Walkthrough: [`demo_video.mp4`](../demo_video.mp4)  
> Official Presentation Deck: [`CareWeave.pptx`](../CareWeave.pptx)  

---

## 🏛️ System Status

| Component | Architecture & Status | Details |
| :--- | :--- | :--- |
| **Front Desk Portal** | Built & Server-backed | Patient registration, live OP waitlist queue, token printer |
| **Laboratory Portal** | Built & Server-backed | Specimen collection, Gemma 4 AI scanner, maker-checker verification |
| **Doctor Portal** | Built & Server-backed | SOAP encounters, 94k formulary prescribing, allergy & duplicate blocks |
| **Exasol In-Memory Analytics** | Built & Integrated | Sub-second TAT audit, percentiles (`PERCENTILE_CONT`), moving averages |
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
npm test                 # Unit tests (bounds, validation, WhatsApp parsing, safety)
npm run test:exasol      # Exasol in-memory analytics parity checks
npm run demo:scale       # 5-Million row benchmark on Exasol Personal
npm run test:acceptance  # End-to-end clinical acceptance checks (100+ rules)

cd ../client
npm test                 # React component & Vitest suites
```

---

## 📄 License
MIT License. See [LICENSE](../LICENSE).
