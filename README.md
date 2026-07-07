# The Conglomerate

A private, chronological archive where band members revisit shared moments, view
related media, and add attributed memories that expand the collective record.

Built as a single Cloudflare Worker application:

- **Frontend:** React + Vite + TypeScript
- **API:** Hono on Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite) via Drizzle ORM
- **Media:** private Cloudflare R2
- **Auth perimeter:** Cloudflare Access (Google + email OTP)

See [`.product/prd-mvp.md`](.product/prd-mvp.md) for the product spec and
[`.product/implementation-plan.md`](.product/implementation-plan.md) for the
milestone plan.

## Prerequisites

- Node.js 20+ (tested on 24) and npm
- A Cloudflare account for remote deploys (local dev needs none)

## Install

```bash
npm install
```

## Local development

The app is one Worker that serves the built SPA and the API. During development
run two processes:

```bash
# Terminal 1 - Worker + API + D1 + R2 (http://localhost:8787)
npm run dev:worker

# Terminal 2 - Vite dev server with HMR (http://localhost:5173, proxies /api + /media)
npm run dev
```

Open http://localhost:5173. Alternatively, `npm run preview` builds the SPA and
serves everything from the Worker on :8787.

### Authentication & roles

Cloudflare Access is the perimeter (Google + email OTP, invite-only). The Worker
verifies the Access JWT (`Cf-Access-Jwt-Assertion`) against the team JWKS and
maps the verified email to an application role stored in D1 (`member` or
`editor`). An approved email with no row yet is auto-provisioned as a `member`.

Production configuration:

- Set `ACCESS_ENFORCED=true`, `ACCESS_TEAM_DOMAIN` (e.g. `your-team.cloudflareaccess.com`),
  and `ACCESS_AUD` (the Access application AUD tag) in the `[env.production]` vars.
- Create a self-hosted Access application in Cloudflare covering the deployed
  domain, with an allowlist policy (Google + one-time PIN).
- Promote an editor:
  `wrangler d1 execute DB --remote --command "UPDATE users SET role='editor' WHERE email='you@example.com'"`.

Local dev: Access cannot run in `wrangler dev`, so the identity middleware falls
back to `DEV_USER_EMAIL` / `DEV_USER_ROLE` (in `wrangler.toml` `[vars]`) and you
are signed in as an editor. `ACCESS_ENFORCED=false` locally disables JWT checks.

## Database

```bash
npm run db:generate        # generate a migration from src/server/db/schema.ts
npm run db:migrate:local   # apply migrations to the local D1
npm run db:migrate:remote  # apply migrations to the remote D1
npm run seed:local         # build + load seed data into local D1
```

Regenerate binding types after editing `wrangler.toml`:

```bash
npm run types
```

## Testing

```bash
npm test         # Vitest (runs inside workerd via @cloudflare/vitest-pool-workers)
npm run typecheck
```

Tests execute against real D1/R2 bindings; migrations are applied automatically
before each suite.

## Deploy (production)

1. **D1:** Create a production database in Cloudflare, set `database_id` under
   `[env.production.d1_databases]` in `wrangler.toml`, then run
   `npm run db:migrate:remote` and `npm run seed:remote` (first deploy only).
2. **R2:** Create bucket `conglomerate-media` (or update the name in
   `wrangler.toml`). For direct browser uploads, create R2 API tokens and set
   secrets: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
   `R2_BUCKET_NAME` via `wrangler secret put`.
3. **Access:** Create a self-hosted Access application for your domain with an
   email allowlist policy (Google + one-time PIN). Set `ACCESS_ENFORCED=true`,
   `ACCESS_TEAM_DOMAIN`, and `ACCESS_AUD` in production vars.
4. **Deploy:** `npm run deploy -- --env production`
5. **Promote an editor:**
   `wrangler d1 execute DB --remote --command "UPDATE users SET role='editor' WHERE email='you@example.com'"`.
6. **Export / backup:** `npm run export` writes a JSON dump of D1 tables to
   `export/`. Back up the R2 bucket separately via the Cloudflare dashboard or
   `wrangler r2 object list`.

Quick deploy:

```bash
npm run deploy   # builds the SPA and runs `wrangler deploy`
npm run deploy -- --env production   # production environment
```

## Project layout

```
src/
  client/   React app (routes, components, design tokens, lib)
  server/   Worker + Hono API (routes, middleware, db, media, audit, auth, lib)
  shared/   Types + Zod schemas shared by client and server
migrations/ Drizzle SQL migrations
scripts/    Seed + export
tests/      Vitest unit + integration
```

## TODO

- [ ] Dedup media idems. Uplaods of the same file are not rejected
- [ ] Add hero image to the timeline
- [ ] Auth
- [ ] Add memory modal
- [ ] 'Edit Event' button placement
- [ ] Show personnel on the performance page

- [-] Add headlined to the events GET data
- [-] Fix 'Headliner' not showing up on event page
- [-] Fix headliner in search
- [ ] Edit opener/headliner in the 'acts' modal

- [-] Add hash to the navigation when the tab is changed on event pages
- [ ] Home page content
