import { applyD1Migrations, env } from "cloudflare:test";

// Applies all generated D1 migrations to the isolated test database before the
// suite runs (see vitest.config.ts, which reads them via readD1Migrations).
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
