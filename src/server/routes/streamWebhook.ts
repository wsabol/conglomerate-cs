import { Hono } from "hono";
import type { AppEnv } from "../env";
import { getDb } from "../db/client";
import { applyStreamWebhookEvent } from "../media/reconcile";
import { verifyStreamWebhook } from "../media/webhook";
import { logProcessing } from "../media/logging";

const route = new Hono<AppEnv>();

route.post("/", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("Webhook-Signature");

  const event = await verifyStreamWebhook(
    rawBody,
    signature,
    c.env.STREAM_WEBHOOK_SECRET,
  );

  if (!event) {
    logProcessing({
      operation: "webhook_rejected",
      errorCode: "WEBHOOK_SIGNATURE_INVALID",
    });
    return c.text("Invalid webhook signature.", 401);
  }

  const db = getDb(c.env);
  await applyStreamWebhookEvent(db, event);
  return c.text("ok", 200);
});

route.all("/", (c) => c.text("Method Not Allowed", 405));

export default route;
