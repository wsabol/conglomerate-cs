# Project guidance

The Conglomerate is a private chronological band archive deployed as one Cloudflare Worker: a React/Vite SPA, Hono API, D1 metadata, R2 originals, and Cloudflare Stream video playback.

## Data and API contracts

- Reuse shared enums, DTOs, and Zod schemas from `src/shared`; do not redefine API shapes in client or server code.
- Every API response must use the `{ data, message }` envelope via the helpers in `src/server/lib/response.ts`. Throw `ApiError` for failures and let the global error handler serialize it; never expose raw errors or stacks.
- Validate request bodies and query parameters with shared Zod schemas at the route boundary.
- Read identity from `c.get("user")`. Protect writes with `requireUser` or `requireEditor` as appropriate.
- Keep routes thin. Reads belong in domain modules under `src/server/db/queries` and writes under `src/server/db/mutations`; import read queries through the barrel.
- Normal UI deletion is soft deletion. Creates, updates, and deletes for events, people, places, media, and annotations must call `recordRevision()` in the same D1 batch as the mutation.
- Put limits, MIME lists, Access settings, and similar configuration in `src/server/lib/config.ts`, not inline.

## Dates

- Preserve `date_precision` (`exact | month | semester | year | approximate | unknown`) and never display more precision than the data contains.
- Render event dates only with `formatEventDate()` from `src/shared/date.ts`; do not format them ad hoc.

## Client behavior

- Route all requests through `apiFetch` and the domain clients in `src/client/lib`; components and routes should not contain raw endpoint URLs.
- Use shared Zod schemas for client-side form validation and pass field messages through each control's `error` prop.
- Use the existing design tokens rather than hard-coded colors, spacing, or typography. Mobile ends at 767px and desktop starts at 768px; prefer CSS media queries unless behavior genuinely requires JavaScript.
- On mobile, event detail is intentionally browse-plus-add-memory only. Keep sidebar content read-only and hide administrative editing, poster management, memory edit/delete, and media upload controls.
- Meaningful actions need visible text or accessible labels and must not rely on hover. Do not shrink sidebars horizontally on mobile, and render memories as archival annotations rather than chat bubbles.

## PWA and Cloudflare Access

- Register the service worker only through the existing `virtual:pwa-register` setup in `main.tsx`; keep PWA configuration in `vite.config.ts`.
- Never precache HTML, install a navigation fallback, or cache `/api`, `/media`, or `/cdn-cgi`. Document requests must reach the network so expired Cloudflare Access sessions can redirect to sign-in.
- The Worker owns only `/api/*` and `/media/*`; do not broaden `run_worker_first`, because doing so breaks `/cdn-cgi/access/*`. The app and API share an origin, so do not add CORS.

## Media invariants

- R2 is the archival system of record for original files. Cloudflare Stream is only for transcoded video playback; D1 owns processing state.
- Stream videos progress `uploading -> uploaded -> processing -> published` (with `failed` retry paths). Never mark a video published until Stream reports it ready. Non-video media publishes directly after verification.
- Upload completion and video processing are idempotent. Preserve the conditional ingest claim so repeated completion cannot create duplicate Stream assets.
- Keep the Stream webhook and ingest-source routes outside identity middleware; authenticate them with their HMAC mechanisms. Production also requires Cloudflare Access bypass rules for those routes.
- Require signed Stream URLs. Never expose `stream_uid`, presigned R2 URLs, playback tokens, webhook secrets, or sensitive URLs in API output or logs. Playback-token responses remain `private, no-store`.
- A normal video URL refers to Stream playback; the R2 original is available only through `?variant=original`. Preserve the original when ingesting into Stream.

## Environments and verification

- Wrangler variables are not inherited by named environments. Keep required bindings and plain-text variables synchronized in both the top-level local configuration and `[env.production]`; secrets stay in `.dev.vars` or Wrangler secrets.
- After changing `wrangler.toml`, run `npm run types`.
- Use `npm run typecheck`, `npm test`, and `npm run build` while developing. `npm run build:prod` is the release gate; deploy commands do not build first.
- Drizzle migrations belong in `migrations/`; do not hand-edit generated metadata unless repairing a known migration issue.
