import path from "node:path";
import { defineConfig } from "vitest/config";
import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";

// Tests run inside workerd (via @cloudflare/vitest-pool-workers) so route
// handlers exercise the real D1 + R2 bindings. Migrations are read at config
// time and applied per test file in tests/setup/apply-migrations.ts.
export default defineConfig(async () => {
  const migrations = await readD1Migrations(
    path.join(__dirname, "migrations"),
  );

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            ENVIRONMENT: "test",
            ACCESS_ENFORCED: "false",
            DEV_USER_EMAIL: "dev@theconglomerate.local",
            DEV_USER_ROLE: "editor",
          },
        },
      }),
    ],
    resolve: {
      alias: {
        "@shared": path.resolve(__dirname, "src/shared"),
        "@server": path.resolve(__dirname, "src/server"),
        "@client": path.resolve(__dirname, "src/client"),
      },
    },
    test: {
      setupFiles: ["./tests/setup/apply-migrations.ts"],
    },
  };
});
