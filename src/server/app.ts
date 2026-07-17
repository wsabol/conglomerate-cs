import { Hono } from "hono";
import type { AppEnv } from "./env";
import { identity } from "./middleware/identity";
import { errorHandler, notFoundHandler } from "./middleware/error";
import healthRoute from "./routes/health";
import meRoute from "./routes/me";
import eventsRoute from "./routes/events";
import peopleRoute from "./routes/people";
import actsRoute from "./routes/acts";
import placesRoute from "./routes/places";
import mediaApiRoute from "./routes/media";
import uploadsRoute from "./routes/uploads";
import annotationsRoute from "./routes/annotations";
import adminRoute from "./routes/admin";
import invitesRoute from "./routes/invites";
import statsRoute from "./routes/stats";
import mediaDeliveryRoute from "./routes/mediaDelivery";
import streamWebhookRoute from "./routes/streamWebhook";

/**
 * Builds the Hono application that owns `/api/*` and `/media/*`. The Worker
 * entry (index.ts) delegates everything else to the static ASSETS binding.
 */
export function createApp() {
  const app = new Hono<AppEnv>();

  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  const api = new Hono<AppEnv>();
  // Health is unauthenticated so uptime probes skip JWT verification and D1.
  api.route("/health", healthRoute);
  api.route("/webhooks/cloudflare-stream", streamWebhookRoute);

  const authed = new Hono<AppEnv>();
  authed.use("*", identity);
  authed.route("/me", meRoute);
  authed.route("/events", eventsRoute);
  authed.route("/people", peopleRoute);
  authed.route("/acts", actsRoute);
  authed.route("/places", placesRoute);
  authed.route("/media", mediaApiRoute);
  authed.route("/uploads", uploadsRoute);
  authed.route("/annotations", annotationsRoute);
  authed.route("/admin", adminRoute);
  authed.route("/invites", invitesRoute);
  authed.route("/stats", statsRoute);
  api.route("/", authed);

  app.route("/api", api);
  app.route("/media", mediaDeliveryRoute);

  return app;
}

export const app = createApp();
