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
  and `ACCESS_AUD` (comma-separated Access application AUD tags for production and
  preview) in the `[env.production]` vars. Set `ACCESS_LOGIN_AUDIENCES` to
  comma-separated `hostname=AUD` entries for every protected public hostname.
- Create self-hosted Access applications covering `www.funkafterdeath.institute` and
  the `workers.dev` preview hostname, each with its own allowlist. `APP_BASE_URL`
  should be the canonical production origin.
- For the branded entry and exit pages, add narrowly scoped Access **Bypass / Everyone**
  applications for `/welcome`, `/logged-out`, `/assets/*`, and `/ico/*` on each
  protected hostname. The Vite SPA needs the asset paths to render those public
  pages. Also bypass only `/api/auth/login` so the public page can request its
  Access login URL. Keep other `/api/*`, `/media/*`, and the archive protected. If
  other static files used by the sign-in page are added, bypass only those files.
- Add a Cloudflare zone redirect rule that runs before Access: when a browser
  requests a protected document path **without** `CF_Authorization`, redirect
  to `/welcome?next=<encoded original path and query>`. Exclude `/welcome`,
  `/logged-out`, `/cdn-cgi/access/*`, API and media routes, and static
  assets. Test the rule with `/` and `/timeline` in a private browser, then use
  Continue from `/welcome`.
  Access does not provide a general setting that redirects an unauthenticated
  self-hosted application request to an arbitrary site page; its custom block
  redirect is for denied users, not this login step. An expired or invalid cookie
  may still show Access's own login screen unless an edge rule handles it.
- `/welcome` is public and does not require an invite token. Its quiz enables
  Continue after a choice; the correct answer requests a login URL from
  `/api/auth/login` and sends the browser directly to Cloudflare Access. Access
  then presents its configured Google / one-time PIN methods and returns to the
  protected `next` path (or `/`). Invite emails link to
  `/welcome` without a token. Logout requests the application-host
  `/cdn-cgi/access/logout` endpoint and shows `/logged-out` after a successful
  response. Do not redirect the logout endpoint itself at the edge, or the
  cookie will not be cleared.
- If an existing SPA session expires during an API request, the client navigates
  to `/welcome`, preserving the current archive path as `next`.

### Invites (Admin)

Editors can send invites from **Admin → Invites**. Each invite:

1. Adds the email to the Cloudflare Access allowlist (when configured).
2. Sends a branded welcome email via [Resend](https://resend.com).
3. Logs the invite in D1 (name, email, inviter, timestamp, status).

Production setup for invites:

- **Vars** in `[env.production.vars]`: `APP_BASE_URL` (site origin), `INVITE_FROM_EMAIL`,
  `ACCESS_ACCOUNT_ID`, `ACCESS_POLICY_ID`, `INVITE_THROTTLE_HOURS`.
- **Secrets** via `wrangler secret put --env production`:
  - `RESEND_API_KEY` — Resend API key (from address domain must be verified in Resend).
  - `CLOUDFLARE_API_TOKEN` — Zero Trust / Access edit permission for allowlist updates.

Without Resend or Access API credentials, local dev still records invites and logs the
would-be email to the Worker console.

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
- **Cached assets:** precaches hashed JS/CSS/fonts/icons. Document navigations
  are not intercepted so Cloudflare Access can redirect expired sessions to
  login. `/api`, `/media`, and `/cdn-cgi` always use the network.
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
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`. Then allow
   browser PUTs from your app origin:
   `npx wrangler r2 bucket cors set conglomerate-media --file r2-cors.json`
   (edit `r2-cors.json` origins if your production URL changes).
3. **Access:** Create a self-hosted Access application for your domain with an
   email allowlist policy (Google + one-time PIN). `ACCESS_ENFORCED`,
   `ACCESS_TEAM_DOMAIN`, and `ACCESS_AUD` (comma-separated production and preview
   AUDs) are in `[env.production.vars]`. Production `APP_BASE_URL` should be
   `https://www.funkafterdeath.institute`.
   For in-app invites, also set `ACCESS_ACCOUNT_ID`, `ACCESS_POLICY_ID`, and
   `APP_BASE_URL`, then add secrets `RESEND_API_KEY` and `CLOUDFLARE_API_TOKEN`.
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

### Living narratives rollout

Events have one summary, directly editable by editors and incrementally updated
by AI whenever eligible memories change. Human edits never disable automation.
Updates preserve unaffected prose; changed or removed memories trigger targeted
corrections. Source snapshots in `narrative_jobs` track memory evidence, not a
second summary. No-op updates preserve the summary and its revision history.
Concurrent editorial changes invalidate in-flight generation, which retries
against the latest summary.

Apply migrations through `0008_lonely_the_order.sql` before deploying this Worker.
Migration `0007` keeps displayed summaries, archives legacy editorial baselines in
revision history, and drops the separate `editorial_summary` column; `0008` tracks
whether an AI summary has previously been generated. Generation is enabled in both local and production
configuration with `NARRATIVES_ENABLED = "true"` and an `AI` binding. Setting the
flag to `"false"` pauses generation while memories continue to queue. The existing 15-minute cron
processes up to ten queued events per run, so the backfill proceeds gradually.
Local development has generation enabled; tests use `wrangler.test.toml` to
avoid a remote AI session.

Monitor `narrative_jobs` for pending/failed counts, oldest `modified_on`,
`attempts`, and `error_code`. New writes replace older pending work for the same
event, and a processing lease prevents stale output from being saved. Pending
jobs remain queued until processed, including across pauses in generation.
Previously expired `QUEUE_EXPIRED` jobs are automatically requeued when generation
runs. The event page ends the foreground overlay after 30 seconds independently
of status polling; work continues in the background. Expired processing leases
show a delayed status and can be reclaimed by cron. AI failures keep the last
displayed summary and retry automatically.
Set the production variable back to `"false"` to pause generation without
discarding queued work.

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


## Automatic event confidence

Confidence is calculated from recorded evidence; editors cannot set it directly.
High requires a valid exact date, one URL/published media citation, and either a
second distinct URL/media citation or (for performances) a setlist/promotional
text. One URL/media citation or two distinct text sources earns medium; all other
cases are low. Missing/imprecise dates cap confidence at medium. Memories and
uncited attachments do not affect it. Sources are not fetched or fact-checked.

Event saves, media eligibility transitions, confidence changes, and their audit
revisions commit together. Concurrent evidence changes return a conflict rather
than saving a stale score. Detail/export responses include `confidenceAssessment`
with a level and stable reason codes. The existing `confidence` field remains in
list, detail, and export responses and in D1.

For the first release, run `npm run build:prod`, deploy, then backfill before
considering rollout complete. Supply `APP_BASE_URL` and an editor's existing
Cloudflare Access session as `CF_ACCESS_JWT` through the environment for production.
Local development uses the existing development identity and needs no session.

```sh
npm run events:confidence-backfill -- --dry-run
npm run events:confidence-backfill -- --apply
npm run events:confidence-backfill -- --dry-run
```

The default is dry-run. The command pages through active events and prints IDs,
old/new levels, and explanation codes without source URLs or authentication data.
Inspect the fresh production dry-run before applying; historical manual labels
are not required outputs. Application writes use a null (system) audit actor and
preserve editorial `modified_on` timestamps. Repeating the apply is safe: unchanged
levels produce no writes or revisions. The final dry-run should report zero changes.
