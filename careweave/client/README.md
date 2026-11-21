# CareWeave client

React 19 + TypeScript + Vite + Tailwind front end for the four portals (front desk, doctor, laboratory, admin) and the public patient pages (`/consult/:token` video link).

```bash
npm install
npm run dev        # http://localhost:5173, proxies /api to the server on :4000
npm run build      # type-check (tsc -b) and production build
npm run lint       # oxlint
npm test           # vitest + Testing Library
```

Layout: `src/portals/<role>` one folder per portal, `src/video` the video call (WebRTC, captions, translation), `src/messaging` staff messaging, `src/auth` sign-in and session.
Setup, environment variables and the full feature list are in the [root README](../../README.md).
