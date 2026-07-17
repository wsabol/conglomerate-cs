#!/usr/bin/env node

const args = process.argv.slice(2);

function readFlag(name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) return "true";
  return value;
}

const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:8787";
const token = process.env.CLOUDFLARE_API_TOKEN;

const params = new URLSearchParams();
if (args.includes("--dry-run")) params.set("dry_run", "true");
if (args.includes("--retry-failed")) params.set("retry_failed", "true");

const mediaId = readFlag("--media-id");
if (mediaId && mediaId !== "true") params.set("media_id", mediaId);

const limit = readFlag("--limit");
if (limit && limit !== "true") params.set("limit", limit);

const url = `${baseUrl.replace(/\/$/, "")}/api/admin/media/stream-backfill?${params}`;

const headers = { Accept: "application/json" };
if (token) {
  headers.Authorization = `Bearer ${token}`;
}

const response = await fetch(url, {
  method: "POST",
  headers,
});

const body = await response.text();
if (!response.ok) {
  console.error(`Backfill failed (${response.status}):`, body);
  process.exit(1);
}

console.log(body);
