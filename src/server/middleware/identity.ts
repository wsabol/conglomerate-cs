import { createMiddleware } from "hono/factory";
import { and, eq } from "drizzle-orm";
import type { AppEnv, AppUser } from "../env";
import type { UserRole } from "@shared/types";
import { getConfig, type AppConfig } from "../lib/config";
import { getDb } from "../db/client";
import { users } from "../db/schema";
import { verifyAccessEmail } from "../auth/access";

/**
 * Resolve the current identity for each request and attach it as `user`.
 *
 * Precedence:
 *  - Production (ACCESS_ENFORCED): the email comes from a verified Cloudflare
 *    Access JWT. Unknown-but-approved emails are auto-provisioned as `member`.
 *  - Local dev: falls back to DEV_USER_EMAIL so the app is usable without
 *    Access running (Access cannot run in `wrangler dev`).
 */
export const identity = createMiddleware<AppEnv>(async (c, next) => {
  c.set("requestId", crypto.randomUUID());

  const config = getConfig(c.env);
  const email = await resolveEmail(c, config);

  let user: AppUser | null = null;
  if (email) {
    user = await resolveUser(c.env, email, config);
  }
  c.set("user", user);

  await next();
});

async function resolveEmail(
  c: Parameters<Parameters<typeof createMiddleware<AppEnv>>[0]>[0],
  config: AppConfig,
): Promise<string | null> {
  if (config.accessEnforced) {
    return verifyAccessEmail(c.req.raw, config);
  }
  // Local/dev: trust the Access header if a proxy set it, else the override.
  const headerEmail = c.req.header("Cf-Access-Authenticated-User-Email");
  return headerEmail ?? config.devUserEmail ?? null;
}

async function resolveUser(
  env: AppEnv["Bindings"],
  email: string,
  config: AppConfig,
): Promise<AppUser | null> {
  const db = getDb(env);
  const normalized = email.trim().toLowerCase();

  const isDevIdentity =
    !config.accessEnforced &&
    config.devUserEmail !== null &&
    normalized === config.devUserEmail.toLowerCase();
  const devRole = (config.devUserRole as UserRole) || "member";

  const row = await db
    .select()
    .from(users)
    .where(and(eq(users.email, normalized), eq(users.isDeleted, false)))
    .get();

  if (row) {
    // Keep the local dev identity's role in sync with DEV_USER_ROLE.
    if (isDevIdentity && config.devUserRole && row.role !== devRole) {
      const updated = await db
        .update(users)
        .set({ role: devRole })
        .where(eq(users.id, row.id))
        .returning()
        .get();
      return toAppUser(updated);
    }
    return toAppUser(row);
  }

  // Access gate-keeps the allowlist, so auto-provision approved users as
  // members on first sight (confirmed decision). Dev identity is provisioned
  // with DEV_USER_ROLE so authorship works locally.
  if (config.accessEnforced || isDevIdentity) {
    const inserted = await db
      .insert(users)
      .values({
        email: normalized,
        role: config.accessEnforced ? "member" : devRole,
      })
      .returning()
      .get();
    return toAppUser(inserted);
  }

  return null;
}

function toAppUser(row: {
  id: number;
  email: string;
  role: UserRole;
  personId: number | null;
}): AppUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    personId: row.personId,
  };
}
