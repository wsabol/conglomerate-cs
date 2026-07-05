# Implementation Plan — The Conglomerate Archive (MVP)

This plan turns [`prd-mvp.md`](./prd-mvp.md) into a concrete, milestone-by-milestone build plan. It is the working reference for engineering. Where the PRD is authoritative on *what*, this document is authoritative on *how* and *in what order*.

- **Stack:** React + Vite + TypeScript (frontend) and Hono on Cloudflare Workers (API), all in one Worker with static assets.
- **Data:** Cloudflare D1 (SQLite) via Drizzle ORM + migrations. Zod for validation.
- **Media:** Private Cloudflare R2, presigned uploads, authenticated Worker delivery with byte-range support.
- **Auth perimeter:** Cloudflare Access (Google + email OTP), allowlist enforced by Access; roles in D1.
- **Deploy:** Wrangler, single repository, single deployment.

Guiding rule from the PRD: **build every page with production design tokens and shared components from day one.** Defer only final editorial composition and decorative polish.

---

## 0. Conventions & Cross-Cutting Decisions

These apply across all milestones. Decisions are made here so milestones stay focused.

### Repository layout
```
conglomerate-cs/
├── src/
│   ├── client/                 # React + Vite app
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── routes/             # page components (timeline, events, media, admin…)
│   │   ├── components/         # shared design-system components
│   │   ├── design/             # tokens, theme, global css
│   │   ├── lib/                # api client, hooks, formatters (dates via Luxon)
│   │   └── types/              # shared response types (re-exported from shared)
│   ├── server/                 # Worker + Hono API
│   │   ├── index.ts            # Worker entry: serves assets + mounts /api, /media
│   │   ├── routes/             # events, people, places, media, uploads, annotations, admin
│   │   ├── middleware/         # access identity, auth, error envelope, request logging
│   │   ├── db/                 # drizzle schema, client, queries, migrations
│   │   ├── media/              # r2 helpers, presign, image processing, mime/limits
│   │   ├── audit/              # object_revisions helpers
│   │   └── lib/                # response envelope, slug, date-precision, config
│   └── shared/                 # types + Zod schemas shared by client and server
│       ├── schemas/            # zod schemas (event, annotation, media, …)
│       └── types.ts            # ApiResponse<T>, enums, DTOs
├── migrations/                 # drizzle-kit generated SQL migrations
├── scripts/                    # seed import, export procedure
├── seed/                       # live-performances.json (moved in), derived seed
├── tests/                      # vitest unit + integration; e2e (playwright) optional
├── .cursor/rules/              # cursor rules (see Milestone 1)
├── drizzle.config.ts
├── wrangler.toml
├── vite.config.ts
├── vitest.config.ts
├── tsconfig*.json
├── package.json
└── README.md
```

### API response envelope (PRD §API Surface)
Every endpoint returns:
```ts
type ApiResponse<T> = { data: T | null; message: string };
```
- List endpoints wrap arrays as `{ data: { results: T[] }, message }`.
- Errors return `data: {}` (or `{ details: [...] }` for SQL/validation detail) with a human message and correct HTTP status.
- A single Hono error-handling middleware produces this envelope for thrown `ApiError`s and Zod failures. Never leak stack traces.

### Validation
- All request bodies/queries validated with Zod at the route boundary. Zod schemas live in `src/shared/schemas` so the client can reuse them for form validation.

### Dates & precision (PRD §Data Rules)
- Store `event_date` (ISO date) + optional `event_time` + `date_precision` enum: `exact | month | semester | year | approximate | unknown`.
- A single `formatEventDate(date, time, precision)` util (client + server share logic) renders per PRD examples using **Luxon** presets (`DATE_SHORT`, `DATETIME_SHORT`). Semester → "Spring/Fall YYYY"; approximate → "Around …"; unknown → "Unknown".
- This util is unit-tested against every example row in the PRD.

### Soft deletion & audit
- No hard deletes in normal UI: `is_deleted = 1`.
- Every create/update/soft-delete on events, people, places, annotations writes an `object_revisions` row (`before_json`/`after_json`, `changed_by`, `changed_at`). Implemented as a small `recordRevision()` helper called inside the same D1 transaction/batch as the mutation.

### Roles & authorization
- Identity comes from Cloudflare Access (`Cf-Access-Authenticated-User-Email` header / JWT). App maps email → `User` row → role (`member | editor`).
- `requireUser` middleware resolves the user; `requireEditor` guards editor-only routes. A disabled/deleted user is denied even if Access lets them in.

### Configuration
- Upload limits, allowed MIME types, and R2/derived settings live in one `config` module (env-overridable), never hard-coded inline (PRD §Upload limits).

### Testing baseline
- **Vitest** for unit (date formatting, slug, validation, envelope) and integration (route handlers against Miniflare/local D1).
- Each milestone ends with green tests and a working `wrangler deploy` (or `wrangler dev` smoke) per the PRD's closing requirement.

---

## Milestone 1 — Foundation

**Goal:** A deployable empty app: Worker serves the Vite build, `/api/health` works, D1 + R2 bound, migrations run, tests run, local dev documented.

### Tasks
1. **Repo & tooling**
   - `git init`; add `.gitignore` (node_modules, dist, .wrangler, .dev.vars, .DS_Store).
   - `package.json` with scripts: `dev`, `build`, `deploy`, `test`, `db:generate`, `db:migrate:local`, `db:migrate:remote`, `seed:local`, `typecheck`, `lint`.
   - TypeScript configs: base + client (DOM) + server (WebWorker/Workers types), path aliases (`@shared`, `@server`, `@client`).
2. **Vite + Worker integration**
   - Vite React app building to `dist/client`.
   - Worker entry serves static assets (via Wrangler `assets` binding) for non-`/api`, non-`/media` routes; SPA fallback to `index.html`.
   - Hono app mounted at `/api`; `/media` reserved (stub until Milestone 6).
   - `GET /api/health` → `{ data: { ok: true }, message: "healthy" }`.
3. **wrangler.toml**
   - `main = src/server/index.ts`, `compatibility_date`, `nodejs_compat` if needed.
   - Bindings: D1 (`DB`), R2 (`MEDIA`), `assets`, vars for config.
   - Environments: default (local/preview) and `production`.
4. **D1 + Drizzle**
   - `drizzle.config.ts`; empty initial schema; generate first (empty or `users`-only) migration; confirm `db:migrate:local` applies.
5. **R2**
   - Create/declare bucket binding; verify a trivial put/get from a throwaway route in dev (removed after).
6. **Auth foundation (stub)**
   - Middleware that reads the Access email header; in local dev, fall back to a `DEV_USER_EMAIL` var so the app is usable without Access. No role logic yet beyond "identified".
7. **Testing setup**
   - Vitest config with a Workers/Miniflare test environment; one passing unit test and one route test (`/api/health`).
8. **Cursor rules** (`.cursor/rules/`)
   - Project rules capturing: response envelope, Zod-at-boundary, Luxon date rules, soft-delete + audit invariant, design-token usage, file layout. (Use the create-rule conventions.)
9. **Local dev docs** in `README.md`: prerequisites, `wrangler dev`, applying migrations, seeding, running tests, and how Access is simulated locally.

### Exit criteria
- `npm run dev` serves a placeholder page; `/api/health` returns the envelope.
- Migrations apply to local D1; R2 binding verified.
- `npm test` green; app deploys to a preview.

---

## Milestone 2 — Design System & Application Shell

**Goal:** Production-grade tokens, typography, responsive shell, and the reusable components every later page depends on. No real data required — build against fixtures.

### Tasks
1. **Design tokens** (`src/client/design/tokens`)
   - Colors exactly per PRD §Color Palette (bg `#080A09`, surface `#171A18`, raised `#242825`, text `#F1E9DA`/`#B7B0A2`, emerald `#078A70`, brass `#C49A47`, orange `#C64C27`, magenta `#8C4F78`, violet `#554B69`).
   - Spacing, radii (4–8px), shadows (minimal), z-index, motion.
   - Exposed as CSS variables + a typed TS token object.
2. **Typography & fonts**
   - Display: Cormorant Garamond (or Bodoni Moda); UI/body: Inter (or Manrope); mono: IBM Plex Mono. Self-host or use a compliant font-loading strategy; define type scale with a design-system **minimum body size** (no tiny text — PRD §Patterns to Avoid).
3. **Responsive breakpoints & layout primitives**
   - Breakpoint tokens; `Container`, `Stack`, `Grid`, `Sidebar` (sidebars reflow into content flow on mobile, never horizontally compressed — PRD §Responsive Rules).
4. **App shell & navigation**
   - Top navbar with "The Conglomerate" brand linking home; nav links collapse into a hamburger on mobile (PRD prototype: Navbar Mobile). No "Add memory" in navbar.
   - Route scaffolding for `/`, `/timeline`, `/performances`, `/events/[slug]`, `/media`, `/admin`, `/events/new`, `/events/[slug]/edit` (guards added later).
5. **Core components** (image-first, dark surfaces, minimal shadow)
   - `Button` (variants: primary=emerald CTA, brass, orange high-energy, ghost), `Card`/`PerformanceCard` (fixed aspect image, metadata below, default image when none), `Modal`, `MediaFrame`, `Annotation`/`Memory` (liner-note style with thin brass rule — not chat bubbles), form controls (`TextField`, `TextArea`, `Select`, `RadioGroup`, `FileInput`), `Pill`/filter chips, `Tag`, `Icon` (labels never replaced by icons).
6. **State components**: loading (skeletons), empty (with placeholder copy), validation, and error states as shared components.
7. **Accessibility baseline**: focus rings, color-contrast checks for secondary text on dark, hover-independent important actions, accessible icon labels, keyboard nav for modal/menus.
8. **Component preview**: a dev-only `/styleguide` route (or Storybook-lite page) rendering all components in all states for review and screenshot testing.

### Exit criteria
- All components render in light-of-tokens with documented variants/states.
- Shell is responsive at mobile and desktop widths; nav collapses correctly.
- Contrast/a11y smoke checks pass; tests for key components (render + variant) green; deploy works.

---

## Milestone 3 — Read-Only Archive

**Goal:** Real data model for the archive, seeded from `live-performances.json`, with a working Timeline and Performance detail page styled with Milestone 2 components. Read-only (no auth-gated writes yet).

### Data model (Drizzle schema)
Implement these tables (PRD §Site Map & Data Model). Enums enforced in app + check constraints where practical.

- `users` — id, email (unique), role (`member|editor`), person_id (nullable FK), is_deleted, created_on, modified_on.
- `people` — id, display_name, aliases (JSON/text), biography fields (minimal), is_deleted, timestamps.
- `places` — id, name, place_type, address (nullable; may be city-only), status (`active|closed|demolished|unknown`), is_deleted, timestamps.
- `events` — id, slug (unique), name, event_type (`performance|party|rehearsal|recording|reunion|other`), event_date, event_time (nullable), date_precision, place_id (nullable FK), summary, confidence (`low|medium|high`), hero_image_id (nullable FK→media), is_deleted, created_on, modified_on.
- `event_performance_details` — event_id (PK/unique FK), billing_name, promotion_text, setlist_text, event_poster_id (nullable FK→media).
- `event_sources` — id, event_id, source_type (`media|url|text`), description, url (nullable), media_id (nullable). *(Note: PRD lists `UNIQUE(event_id)` but the intent is multiple sources per event — implement one row per source; flag this discrepancy and default to allowing many. See Open Questions.)*
- `event_people` — event_id, person_id, relationship_type (`performer|attendee|organizer|photographer|unknown`), notes, is_deleted, timestamps; `UNIQUE(event_id, person_id, relationship_type)`.
- `event_acts` — id, event_id, name, billing_role (`opener|headliner|unknown`), timestamps; `UNIQUE(event_id, name)`.
- `media` — id, event_id (nullable FK), title, media_type (`photo|video|audio|document|link`), r2_key, original_filename, mime_type, size, checksum, status (`uploading|processing|published|failed`), captured_date (nullable) + date_precision, description, uploader/created_by, source/provenance, is_deleted, timestamps, plus derived-asset keys (display_key, thumb_key) for images.
- `media_people` — media_id, person_id (tagged people).
- `annotations` — id, target_type (`event|media`), target_id, body, author_id, annotation_type (`personal_memory|secondhand_account|correction|quote|context`), incorporate_pref (`yes|no_pref|separate`), is_deleted, timestamps.
- `annotation_people` — annotation_id, person_id.
- `object_revisions` — id, target_id, target_type (`annotation|event|people|places`), action (`create|update|delete`), before_json, after_json, changed_by, changed_at.

Add indexes for common queries: `events(event_date)`, `events(modified_on)`, `events(event_type)`, `media(event_id)`, `annotations(target_type,target_id)`, `event_people(person_id)`.

### Seed import
- Move `live-performances.json` into `seed/`.
- `scripts/seed.ts` maps each row → one `events` row (event_type `performance`), `event_performance_details`, `places` (dedupe by venue name → create/link), `event_acts` (from `acts[]`), and `event_sources` (from `sources[]`: URL vs free-text detection). `notes`/`description` seed the `summary`. `confidence` maps directly. Generate slugs from title + date; dedupe collisions. Parse `date`/`time` and infer `date_precision` (exact when full date+known, else month/year heuristics — conservative default `exact` for full dates present in data).
- Idempotent: re-running upserts by slug. Runs against local D1 via Wrangler.
- People: seed known band members (Will, McIan, Brent, Eddie, Sean, Ryan, …) as `people`; optionally link via `event_people` where notes clearly state personnel. Keep conservative.

### API (read-only slice)
- `GET /api/events` — list; default sort **most recently modified first** (`modified_on DESC`, per Browse acceptance criteria); supports filters: `year`, `event_type`, `person`, `place`. Returns cards' data incl. media-availability flags.
- `GET /api/events/:slug` — full event aggregate (details, place, people, acts, sources, media, annotations placeholder).
- `GET /api/people`, `GET /api/people/:id`, `GET /api/places`, `GET /api/places/:id`.
- `GET /api/media` — list with `media_type`, `year`, `person` filters (returns seeded/empty until Milestone 6).

### Pages
- **Timeline** (`/timeline`): reverse-chronological, grouped by year with pill-style year controls; cards show primary image (or default), title, date (precision-aware), place, event-type, and media-availability indicators; no advanced filters here; no record-age metadata (PRD prototype warnings). Mobile-friendly.
- **Performances** (`/performances`): compact cards (fixed aspect image, metadata below, not overlaid), search box, filter dropdowns for venue/personnel/lineup (opener vs headliner). Mobile shows only search box.
- **Performance detail** (`/events/[slug]`): hero image (prefer `hero_image_id` else `event_poster_id`, else default), title (event name or billing_name), date/time + place + personnel as subtitle icons+tags, gradient into content, curated summary, sidebar for setlist + other acts, media gallery (placeholder until M6), **Memories section below summary** (placeholder copy for now), **Sources section last**. Avoid tabs for memories/sources; avoid thin/italic main heading.
- **Home** (`/`): basic composition now (project description, recently added, timeline entry point) — full cinematic polish deferred to M8.

### Exit criteria
- Seed populates local D1; Timeline and Performance detail render real seeded events, responsive and styled.
- List sorting/filtering matches Browse acceptance criteria; approximate dates render without false precision.
- Date-formatting unit tests + route integration tests green; deploy works.

---

## Milestone 4 — Authentication & Roles

**Goal:** Real Cloudflare Access integration, email→User mapping, member/editor authorization, editor-only routes/controls.

### Tasks
1. **Access integration**: verify the Access JWT (`Cf-Access-Jwt-Assertion`) against the team's public keys (JWKS), extract email. In production, reject requests lacking a valid Access assertion. Keep local dev override behind an env flag.
2. **User mapping**: on authenticated request, resolve/lookup `users` by email. Behavior for unknown-but-Access-approved email: create as `member` by default *or* deny — **confirm policy** (see Open Questions; default to auto-create member, since Access already gate-keeps the allowlist). Respect `is_deleted`/disabled → deny.
3. **Authorization middleware**: `requireUser`, `requireEditor`. Apply `requireEditor` to `POST/PATCH/DELETE /api/events`, people/place management, media reassignment, admin routes, and the `/events/new` & `/events/[slug]/edit` client routes.
4. **Client auth context**: `GET /api/me` returns current user + role; client uses it to show/hide editor controls and guard editor routes (server remains the source of truth).
5. **Sign-in page** styled per prototype 4: "Continue with Google" and "email one-time PIN" framing (these are Access-hosted; the app page explains/links). No sign-up, no password, no forgot-password.
6. **Docs**: how to configure the Access application, allowlist policy, and identity providers.

### Exit criteria
- Unauthenticated (no Access) requests to the API are rejected in production config; authenticated requests resolve a role.
- Editor-only routes/controls hidden for members and enforced server-side.
- Tests cover role gating (member vs editor vs disabled); deploy works.

---

## Milestone 5 — Annotation (Memory) CRUD

**Goal:** Members can add/edit/delete their own memories on events (and media targets); presented as liner-note annotations; every change audited.

### API
- `POST /api/annotations` — body validated by Zod: `target_type`, `target_id`, `body`, `annotation_type`, `incorporate_pref`, optional `people[]`. Sets `author_id` from current user. Writes `annotation_people` and an `object_revisions` create row.
- `PATCH /api/annotations/:id` — author-only; updates body/type/people/pref; audit update row.
- `DELETE /api/annotations/:id` — author-only soft delete (editors may delete/unattribute any — align with media rules); audit delete row.
- Event/media detail responses include annotations, newest first.

### UI (PRD §Annotation workflow + scheme)
- On event page: "Add a memory" action expands to a **lightweight form**: "What do you remember?" (body), "Who was involved?" (people mentions), type radio (personal memory / someone told me / correction-clarification / quote), and "Should this be in the summary?" (Yes / No preference / Keep as separate note).
- New annotation appears immediately, newest first, below the event summary, flagged with author + created date/time.
- Edit via modal; only the author sees Edit/Delete on their own memories.
- Empty state: placeholder text when no memories (prototype 3).
- Memories attachable to media items too (same component, `target_type=media`).

### Exit criteria
- Add/edit/delete flows work end-to-end with immediate UI update and author/date attribution.
- Author-only edit/delete enforced server-side; audit rows written for every change.
- Tests for permissions + audit; deploy works.

---

## Milestone 6 — Protected Media

**Goal:** Authenticated media upload (direct to R2 via presigned URLs), metadata + checksums, galleries, audio/video playback, protected retrieval with byte-range.

### Upload flow (PRD §Uploads)
1. `POST /api/uploads` — validate intended file(s): filename, MIME (against configured allow-list), declared size (against per-type limits), target event. Create `media` row `status=uploading`, generate R2 object key, return **short-lived presigned PUT URL(s)**.
2. Browser uploads directly to R2.
3. `POST /api/uploads/:id/complete` — API verifies the object exists in R2, records size + **checksum**, validates metadata; for images generates **display + thumbnail** variants and corrects orientation; sets `status=published` (or `failed`). Failed uploads never become published media.

### Retrieval (PRD §Media Retrieval)
- `GET /media/:mediaId` — verify identity → look up media (must be published/authorized) → stream from R2 with correct content-type + cache headers → **support byte-range** for audio/video.

### Metadata / management
- `PATCH /api/media/:id` — edit title, description, captured date/precision, tagged people, related event, provenance.
- `DELETE /api/media/:id` — uploader may delete own; editor may delete/unattribute any; soft delete only (no hard delete in normal UI).

### Constraints (PRD §Media)
- Images: JPEG/PNG/WebP + common phone formats; preserve original, one display + one thumbnail, correct orientation.
- Audio inline: MP3, M4A/AAC, WAV (where browser-compatible); others download-only.
- Video inline: MP4 (browser codecs), WebM; don't promise every format.
- Limits configurable: photo 25MB, audio 500MB, video 2GB, doc 100MB.

### UI
- Event page **media gallery** (poster/flyer, audio, video, photos) using `MediaFrame`; inline audio/video players; hero/poster wiring (`hero_image_id`/`event_poster_id`).
- **Media dashboard** (`/media`): browse by type (Photos/Videos/Audio), filter by year and optionally person, open related event; multi-file upload from event page with progress; failed-upload handling.

### Exit criteria
- Multi-file direct-to-R2 upload works; checksum + metadata recorded; published only on success.
- Protected retrieval works with range requests; galleries + playback function.
- Uploader/editor delete rules enforced; tests for upload finalize + auth on `/media/:id`; deploy works.

---

## Milestone 7 — Editor Tools

**Goal:** Editors can fully manage events, reassign media, and review audit history.

### Tasks
1. **Event CRUD UI**: `/events/new` and `/events/[slug]/edit` (editor-only) forms covering all event + performance-detail fields, place selection/creation, people (personnel) with relationship types, acts with billing role, and event sources. Uses shared form controls + Zod validation. `POST/PATCH/DELETE /api/events` fully implemented with audit + soft delete.
2. **People & places management** (editor-only): create/edit/soft-delete people and places (basic — no rich bios/pages per non-goals).
3. **Media reassignment**: editor can move media between events / unattribute; audited.
4. **Admin page** (`/admin`, editor-only): user management (set role, disable), event management shortcuts, and **change-history view** reading `object_revisions` (filter by target type/date/user; show before/after diff).

### Exit criteria
- Editors create/edit/delete events and manage people/places/media; members cannot.
- Audit history view renders real revisions; all mutations produce revisions.
- Tests for editor gating + CRUD + audit; deploy works.

---

## Milestone 8 — Preservation & Polish

**Goal:** Final editorial composition, cinematic treatment, robustness, export, and deployment docs.

### Tasks
1. **Homepage composition**: full hero using [`homepage-hero.jpg`](../images/652176842_26582093478065608_5395107200525570428_n.jpg) with vignette/bottom gradient, heavy ivory heading (not italic), project framing answering what/who/why/where-to-begin, recently-added, timeline entry.
2. **Cinematic image treatments**: subtle grain/contrast/dark framing for lower-quality archival images; keep strong live photography full-color.
3. **Visual refinement** against the 70/20/10 balance and brand motifs (used sparingly).
4. **Export procedure**: `scripts/export.ts` producing a portable dump of D1 records + an R2 object manifest (preservation goal). Documented.
5. **Robustness**: comprehensive error handling, loading states, empty states across all pages; final accessibility pass (contrast, keyboard, labels, minimum body size).
6. **Performance**: image `srcset`/lazy-loading, cache headers, code-splitting, query indexes review.
7. **Deployment documentation**: production Wrangler config, D1 remote migrations, R2 bucket, Access application + allowlist, secrets/vars, rollback.

### Exit criteria
- Home reads as "a black archival structure interrupted by vivid pools of live color."
- Export produces a restorable archive; a11y/perf checks pass; full test suite green; production deploy documented and executed.

---

## Testing Strategy (all milestones)
- **Unit:** date/precision formatting (every PRD example), slug generation, response envelope, Zod schemas, config limits, checksum.
- **Integration:** each API route against local D1/Miniflare incl. auth/role gating, soft-delete + audit invariants, upload finalize, byte-range media.
- **Component:** render + variants/states for design-system components; page smoke tests.
- **Optional e2e:** Playwright for core flows (browse → event → add memory; upload → gallery) once M6 lands.
- Every milestone ends with green tests + a working deployment (PRD closing requirement).

## Risk & Sequencing Notes
- **Access locally:** Access can't run in `wrangler dev`; the dev email override (M1/M4) keeps local flow usable — must be disabled in production config.
- **R2 presign in Workers:** confirm presigned-URL approach (S3-compatible signing) early in M6; fallback is streaming uploads through the Worker for smaller files.
- **Image processing on Workers:** validate the chosen approach (e.g., Photon/wasm or Cloudflare Images later) for thumbnails/orientation within Worker limits; may start minimal and expand.
- **Seed fidelity:** date-precision inference from `live-performances.json` is heuristic; editors can correct via M7 tools.

## Open Questions (confirm with product owner)
1. **`event_sources` uniqueness:** PRD schema says `UNIQUE(event_id)` but the narrative wants multiple sources per event (and seed data has several). Plan assumes **many sources per event**; confirm.
2. **Unknown Access-approved emails:** auto-create as `member`, or deny until an editor provisions them? Plan defaults to **auto-create member** (Access already enforces the allowlist).
3. **Annotation delete by editors:** PRD is explicit for media (editors delete/unattribute any) but implicit for annotations. Plan assumes **editors may soft-delete any annotation**; confirm.
4. **`date_precision` seeding:** acceptable to default full-date rows to `exact` and hand-correct later? 
