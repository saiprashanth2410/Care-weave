# CareWeave WhatsApp workflow

Import `careweave-whatsapp-workflow.json` in n8n: **Workflow, Import from File**.

CareWeave posts `PATIENT_CHECKED_IN`, `LAB_REPORT_RELEASED` and `PRESCRIPTION_PRESCRIBED` to
`/webhook/careweave-events`. The workflow formats a message and sends it through Meta WhatsApp Cloud API
(when `META_WHATSAPP_TOKEN` is set) or Twilio.

Replies: post `{"event":"INBOUND_MESSAGE","from":"<phone>","body":"QUEUE"}` to the same webhook (for example
from an n8n Twilio Trigger or a Meta webhook relay). `QUEUE`/`TOKEN`, `REPORT <UHID>` and `MEDS <UHID>` (or `RX`) call the
CareWeave `/api/whatsapp/*` endpoints and answer with live data. Reports and medicines need the patient's UHID as well as the sending phone number, and both must match one patient. Without n8n, point Twilio or Meta straight at
`POST /api/whatsapp/inbound?key=<WHATSAPP_API_KEY>`.

## Environment variables (n8n)

| Variable | Purpose |
|---|---|
| `CAREWEAVE_API_URL` | CareWeave API, default `http://localhost:4000` |
| `WHATSAPP_API_KEY` | Same value as on the CareWeave server |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` | Twilio sending |
| `META_WHATSAPP_TOKEN`, `META_PHONE_NUMBER_ID` | Meta sending (takes priority when set) |
| `DEFAULT_COUNTRY_CODE` | Prefix for 10-digit numbers, default `91` |

n8n blocks `$env` in nodes by default in recent versions; start it with `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`.
