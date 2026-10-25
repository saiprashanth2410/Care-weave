# Exasol Personal Integration Guide & Architecture

> **ExaThon India 2026 Submission Document**  
> **Platform:** CareWeave Unified Hospital Health Records & Intelligence Engine  
> **Author:** Saiprashanth T (`saiprashanth1510@gmail.com`)

---

## 1. Architecture Overview: Dual-Database Strategy (OLTP + OLAP)

Modern clinical hospital operations demand sub-second latency for front desk and emergency consultations, alongside complex multi-dimensional aggregation across millions of diagnostic and prescription records.

CareWeave resolves this through a **Hybrid Transactional/Analytical Processing (HTAP)** architecture:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CareWeave Architecture                          │
└────────────────────────────────────────────────────────────────────────┘

    [Receptionist Portal]    [Diagnostic Lab Portal]    [Physician Workspace]
             │                          │                          │
             └──────────────────────────┼──────────────────────────┘
                                        ▼
                           ┌─────────────────────────┐
                           │    Node / Express API   │
                           └────────────┬────────────┘
                                        │
           ┌────────────────────────────┴──────────────────────────┐
           ▼ (OLTP - Low Latency CRUD)                             ▼ (OLAP - Analytical Queries)
┌───────────────────────────┐                             ┌───────────────────────────┐
│       MongoDB Atlas       │───[Idempotent Pipeline]────►│      Exasol Personal      │
│   Transactional Database  │        (MERGE / UPSERT)     │     In-Memory Columnar    │
│  (Patients, Encounters,   │                             │      Analytics Engine     │
│   Lab Orders, Scans, Rx)  │                             │   (TAT, Workload, Supply) │
└───────────────────────────┘                             └─────────────┬─────────────┘
                                                                        │
                                                                        ▼
                                                          ┌───────────────────────────┐
                                                          │   CareWeave Intelligence  │
                                                          │    Analytics Dashboard    │
                                                          └───────────────────────────┘
```

1. **MongoDB Atlas (OLTP)**: Manages atomic clinical records, active patient tokens, encrypted credentials, and lab results.
2. **Exasol Personal (OLAP)**: In-memory columnar analytics database executing sub-second group-by and window functions over diagnostic turnaround times, departmental patient wait funnels, and pharmacy consumption velocity.
3. **Idempotent Data Pipeline (`sync.ts`)**: Reads clinical operational events and executes SQL `MERGE` commands to synchronize records into Exasol analytics fact tables without duplicate risk.

---

## 2. Exasol Schema Definition (`CAREWEAVE_ANALYTICS`)

### Table 1: `FACT_PATIENT_VISITS`
Captures outpatient arrival, department routing, consultation duration, and patient wait-time funnels:
```sql
CREATE TABLE IF NOT EXISTS FACT_PATIENT_VISITS (
  VISIT_ID VARCHAR(64) PRIMARY KEY,
  PATIENT_ID VARCHAR(64),
  VISIT_DATE DATE,
  VISIT_TIME VARCHAR(16),
  DEPARTMENT VARCHAR(64),
  DOCTOR_NAME VARCHAR(128),
  STATUS VARCHAR(32),
  REASON VARCHAR(256),
  WAIT_TIME_MINUTES INT,
  CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Table 2: `FACT_LAB_ORDERS_TAT`
Tracks diagnostic specimen lifecycles from collection to pathologist verification and release, auditing Service Level Agreement (SLA) turnaround times:
```sql
CREATE TABLE IF NOT EXISTS FACT_LAB_ORDERS_TAT (
  ORDER_ID VARCHAR(64) PRIMARY KEY,
  PATIENT_ID VARCHAR(64),
  TEST_NAME VARCHAR(128),
  DEPARTMENT VARCHAR(64),
  PRIORITY VARCHAR(16),
  STATUS VARCHAR(32),
  CREATED_AT TIMESTAMP,
  COLLECTED_AT TIMESTAMP,
  VERIFIED_AT TIMESTAMP,
  RELEASED_AT TIMESTAMP,
  TAT_MINUTES INT,
  SLA_TARGET_MINUTES INT,
  WITHIN_SLA BOOLEAN,
  CRITICAL_FLAG_COUNT INT
);
```

### Table 3: `FACT_PHARMACY_PRESCRIPTIONS`
Monitors pharmaceutical dispensation, generic substitution velocity, and antimicrobial safety overrides:
```sql
CREATE TABLE IF NOT EXISTS FACT_PHARMACY_PRESCRIPTIONS (
  PRESCRIPTION_ID VARCHAR(64),
  PATIENT_ID VARCHAR(64),
  DOCTOR_NAME VARCHAR(128),
  PRESCRIBED_DATE DATE,
  MEDICINE_NAME VARCHAR(256),
  GENERIC_NAME VARCHAR(256),
  FORM VARCHAR(64),
  DOSAGE VARCHAR(64),
  QUANTITY INT,
  DURATION_DAYS INT,
  ALLERGY_ALERT_TRIGGERED BOOLEAN,
  PRIMARY KEY (PRESCRIPTION_ID, MEDICINE_NAME)
);
```

---

## 3. How to Run Exasol Personal Locally on macOS (Apple Silicon M1)

### Step 1: Install Exasol Launcher
Exasol provides an official macOS installer CLI:
```bash
curl https://downloads.exasol.com/exasol-personal/installer.sh | sh
```
*Ensure `~/.local/bin` is in your terminal `PATH`.*

### Step 2: Spin Up the Local Database
```bash
exasol install local
```
The launcher provisions the in-memory database cluster listening on port `8563`.

### Step 3: Test Interactive Connection
```bash
exasol connect
```
Run a test query in the interactive shell:
```sql
SELECT 'Exasol Personal is running for CareWeave' AS STATUS;
```

---

## 4. CareWeave Application Setup & Launch

### Step 1: Configure Environment Variables
Create `.env` in `careweave/server/.env`:
```env
PORT=4000
MONGODB_URI="mongodb+srv://<username>:<password>@cluster0.lovylqn.mongodb.net/careweave?retryWrites=true&w=majority"
MONGODB_DB="careweave"

EXASOL_HOST="localhost"
EXASOL_PORT=8563
EXASOL_USER="sys"
EXASOL_PASSWORD="your-exasol-password"
EXASOL_SCHEMA="CAREWEAVE_ANALYTICS"
```

### Step 2: Run Development Servers
```bash
# Terminal 1: Backend API (port 4000)
npm run server

# Terminal 2: Vite React Client (port 5173)
npm run dev
```

### Step 3: Access the Analytics Dashboard
Open `http://localhost:5173/analytics` or sign in and click the **"Exasol Analytics"** button in any portal header.

---

## 5. Circuit Breaker & Fallback Architecture
CareWeave implements an enterprise-grade fallback circuit breaker:
* **Exasol Live**: Executes native in-memory columnar aggregations via `@exasol/exasol-driver-ts` with WebSocket transport.
* **Exasol Daemon Offline / Booting**: Automatically detects connection refusal within 3 seconds, seamlessly routes to MongoDB OLTP analytical aggregations, and tags the response with `engine: "MongoDB Analytics Pipeline (Fallback)"`.
* Zero application crashes, zero fake data, and 100% transparency for judges and administrators.
