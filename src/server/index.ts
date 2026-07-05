import { app } from "./app";
import type { Env } from "./env";

// The Worker runs first (run_worker_first). It owns the API and media routes
// and hands everything else to the static assets binding (SPA fallback).
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (
      url.pathname.startsWith("/api") ||
      url.pathname.startsWith("/media")
    ) {
      return app.fetch(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
