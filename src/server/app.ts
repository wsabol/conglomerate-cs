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
import mediaDeliveryRoute from "./routes/mediaDelivery";

/**
 * Builds the Hono application that owns `/api/*` and `/media/*`. The Worker
 * entry (index.ts) delegates everything else to the static ASSETS binding.
 */
export function createApp() {
  const app = new Hono<AppEnv>();

  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  const api = new Hono<AppEnv>();
  api.use("*", identity);
  api.route("/health", healthRoute);
  api.route("/me", meRoute);
  api.route("/events", eventsRoute);
  api.route("/people", peopleRoute);
  api.route("/acts", actsRoute);
  api.route("/places", placesRoute);
  api.route("/media", mediaApiRoute);
  api.route("/uploads", uploadsRoute);
  api.route("/annotations", annotationsRoute);
  api.route("/admin", adminRoute);

  app.route("/api", api);
  app.route("/media", mediaDeliveryRoute);

  return app;
}

export const app = createApp();
