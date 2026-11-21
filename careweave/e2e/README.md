# Browser tests

End-to-end checks for the video consultation and staff messaging, driven by a real Chrome (`puppeteer-core`). They start calls between two browsers with a fake camera and microphone, so they need a visible (not headless) Chrome.

Run the API and the client first (the API with the demo accounts enabled: `ALLOW_LOCAL_LOGIN=true`, no external keys), then:

```bash
cd careweave/e2e
npm install
npm test                       # every script
node doctor-chat-button.mjs    # or a single one
```

| Script | Checks |
| --- | --- |
| `video-call.mjs` | doctor starts a call, patient joins by link, video flows, chat, photo, captions, summary, end |
| `walk-in.mjs` | a walk-in with no record can be called |
| `doctor-chat-button.mjs` | the doctor's side panel hides when the call connects; the Chat button brings it back |
| `call-survives-navigation.mjs` | the call stays connected while the doctor opens other pages or another browser tab |
| `patient-layout.mjs` | patient chat is a side panel on a laptop and a bottom sheet on a phone |
| `staff-messaging.mjs` | front desk and doctor message each other with photos and unread counts |

Environment: `WEB` (default `http://localhost:5173`), `API` (`http://localhost:4000`), `CHROME` (path to Chrome), `E2E_OUT` (where screenshots go, default the temp folder).
