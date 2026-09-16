#!/usr/bin/env node

// Uses the authenticated application endpoint, never a raw D1 UPDATE.
const args = process.argv.slice(2);
if (args.some((arg) => !["--dry-run", "--apply"].includes(arg)) || (args.includes("--apply") && args.includes("--dry-run"))) {
  console.error("Usage: npm run events:confidence-backfill -- [--dry-run | --apply]");
  process.exit(1);
}
const dryRun = !args.includes("--apply");
const base = new URL(process.env.APP_BASE_URL ?? "http://localhost:8787");
const headers = { Accept: "application/json" };
// Use an editor's Access session, passed via environment rather than command-line arguments.
if (process.env.CF_ACCESS_JWT) headers.Cookie = `CF_Authorization=${process.env.CF_ACCESS_JWT}`;
let afterId = 0;
let examined = 0;
let changed = 0;
do {
  const url = new URL("/api/admin/events/confidence-backfill", base);
  url.searchParams.set("dry_run", String(dryRun));
  url.searchParams.set("after_id", String(afterId));
  const response = await fetch(url, { method: "POST", headers, redirect: "manual" });
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
    // Access redirect URLs may contain session data; do not print responses or headers.
    console.error(`Backfill failed (HTTP ${response.status}). Check APP_BASE_URL and an editor's CF_ACCESS_JWT session.`);
    process.exit(1);
  }
  const { data } = await response.json();
  if (!data || !Array.isArray(data.results)) throw new Error("Unexpected backfill response.");
  for (const row of data.results) {
    console.log(JSON.stringify(row));
    examined++;
    if (row.changed) changed++;
  }
  afterId = data.nextAfterId;
} while (afterId !== null);
console.log(JSON.stringify({ dryRun, examined, [dryRun ? "wouldChange" : "changed"]: changed }));
