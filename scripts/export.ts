/**
 * Export a portable JSON dump of D1 tables for preservation.
 * Run: npm run export
 *
 * Requires wrangler CLI and a local or remote D1 binding.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = join(process.cwd(), "export");
const TABLES = [
  "users",
  "people",
  "places",
  "events",
  "event_performance_details",
  "event_sources",
  "event_people",
  "event_acts",
  "media",
  "media_people",
  "annotations",
  "annotation_people",
  "object_revisions",
] as const;

const local = process.argv.includes("--remote") ? "" : "--local";

mkdirSync(OUT_DIR, { recursive: true });

const manifest: Record<string, unknown> = {
  exportedAt: new Date().toISOString(),
  tables: {},
};

for (const table of TABLES) {
  const cmd = `npx wrangler d1 execute DB ${local} --command "SELECT * FROM ${table}" --json`;
  try {
    const raw = execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    const parsed = JSON.parse(raw) as { results?: unknown[] }[];
    const rows = parsed.flatMap((chunk) => chunk.results ?? []);
    manifest.tables = { ...(manifest.tables as object), [table]: rows };
    console.log(`Exported ${table}: ${rows.length} rows`);
  } catch (e) {
    console.warn(`Skipped ${table}:`, e instanceof Error ? e.message : e);
  }
}

const outFile = join(OUT_DIR, `archive-${Date.now()}.json`);
writeFileSync(outFile, JSON.stringify(manifest, null, 2));
console.log(`Wrote ${outFile}`);
console.log(
  "R2 objects are not included — maintain a separate bucket backup or inventory via the Cloudflare dashboard.",
);
