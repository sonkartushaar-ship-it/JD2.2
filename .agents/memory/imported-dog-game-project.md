---
name: Imported dog-game project layout
description: Notes on the pnpm-workspace project imported from zip (Dog Sprite Playground) — artifact routing and DB state.
---

- API routes are mounted under `/api` inside the Express app itself (`app.use("/api", router)`), and the artifact's preview path is also `/api` — so the health check is reachable at `/api/healthz` both directly on the server and through the artifact proxy.
- `lib/db/src/schema/index.ts` ships empty (just a comment template, `export {}`) — no tables defined yet. `drizzle-kit push` reports "No changes detected" until a real schema is added.
- `DATABASE_URL` was already present in the environment at import time; no provisioning needed.
