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

## Installable PWA

The client is an installable Progressive Web App (standalone home-screen icon on
mobile and desktop).

- **Manifest + service worker:** generated at build time via `vite-plugin-pwa`
- **Offline shell:** precaches the SPA assets; `/api` and `/media` always use the
  network (no stale archive data)
- **Icons:** static PNGs in `src/client/public/ico/` (favicons, PWA, apple-touch)

To test locally:

```bash
npm run preview   # build + serve from the Worker on :8787
```

Then open the site in Chrome or Safari and use **Install** / **Add to Home Screen**.
In dev, the service worker is also enabled on the Vite server (`:5173`) for
quicker iteration.

## Deploy (production)

Production config lives in `wrangler.toml` under `[env.production]` (vars,
D1, R2). Top-level `[vars]` is local dev only.

1. **D1:** Create a production database in Cloudflare, set `database_id` under
   `[env.production.d1_databases]`, then run
   `wrangler d1 migrations apply DB --remote --env production`.
2. **R2:** Create bucket `conglomerate-media` (or update the name in
   `wrangler.toml`). For direct browser uploads, create R2 API tokens and set
   secrets via `wrangler secret put --env production`: `R2_ACCOUNT_ID`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`.
3. **Access:** Create a self-hosted Access application for your domain with an
   email allowlist policy (Google + one-time PIN). `ACCESS_ENFORCED`,
   `ACCESS_TEAM_DOMAIN`, and `ACCESS_AUD` are in `[env.production.vars]`.
4. **Promote an editor:**
   `wrangler d1 execute DB --remote --env production --command "UPDATE users SET role='editor' WHERE email='you@example.com'"`.
5. **Back up R2** via the Cloudflare dashboard or `wrangler r2 object list`.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run build` | Vite SPA build only |
| `npm run build:prod` | typecheck → test → build (release gate) |
| `npm run deploy` | `wrangler deploy` (top-level / dev vars) |
| `npm run deploy:prod` | `wrangler deploy --env production` |

Manual production deploy:

```bash
npm run build:prod && npm run deploy:prod
```

### Cloudflare Workers Builds (GitHub)

Workers Builds runs **build command** then **deploy command**. A failing build
skips deploy. Configure under **Settings → Build**:

| Setting | Value |
| --- | --- |
| Build command | `npm run build:prod` |
| Deploy command | `npm run deploy:prod` |
| Non-production branch deploy command | `npx wrangler versions upload --env production` |

`[env.production.vars]` is applied on each deploy via `--env production`.
Runtime secrets are not in `wrangler.toml` — set them once in the dashboard
(**Settings → Variables & Secrets**) or with `wrangler secret put --env production`.

## Project layout

```
src/
  client/   React app (routes, components, design tokens, lib)
  server/   Worker + Hono API (routes, middleware, db, media, audit, auth, lib)
  shared/   Types + Zod schemas shared by client and server
migrations/ Drizzle SQL migrations
tests/      Vitest unit + integration
```

## Notes on Terminlogy

- "Membery" and "Memberberry" are not typos. They are mashups of "member" and "memory" -- as in "a memory from a member of the group"

## TODO

- [ ] Wire src/client/routes/SignIn.tsx to redirect to Access login URLs (Milestone 4 in your implementation plan).
- [ ] 