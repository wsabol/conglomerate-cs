import { Hono } from "hono";
import { feedbackCreateSchema, feedbackListQuerySchema, feedbackReviewSchema } from "@shared/schemas/feedback";
import type { AppEnv } from "../env";
import { getDb } from "../db/client";
import { getFeedbackById, listFeedback } from "../db/queries";
import { claimFeedbackIssue, claimFeedbackNotification, createFeedback, releaseFeedbackIssueClaim, resetUncertainFeedbackIssue, setFeedbackIssueCreated, setFeedbackNotificationStatus, setFeedbackReviewStatus } from "../db/mutations/feedback";
import { requireEditor, requireUser } from "../middleware/auth";
import { badGateway, badRequest, conflict, notFound } from "../lib/errors";
import { ok, okList } from "../lib/response";
import { sendFeedbackEmail } from "../mail/sendFeedback";
import { createFeedbackIssue } from "../services/feedbackIssue";

const route = new Hono<AppEnv>();

function feedbackId(raw: string): number {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) throw badRequest("Invalid feedback id.");
  return id;
}

route.post("/", requireUser, async (c) => {
  const input = feedbackCreateSchema.parse(await c.req.json());
  const db = getDb(c.env);
  const id = await createFeedback(db, input, c.get("user")!.id);
  const report = await getFeedbackById(db, id);
  if (report) {
    try {
      await sendFeedbackEmail(c.env, report);
      await setFeedbackNotificationStatus(db, id, "sent");
    } catch {
      await setFeedbackNotificationStatus(db, id, "failed");
    }
  }
  return ok(c, { id }, "Feedback received", 201);
});

route.get("/", requireEditor, async (c) => {
  const query = feedbackListQuerySchema.parse(c.req.query());
  return okList(c, await listFeedback(getDb(c.env), query), "Returned feedback");
});

route.patch("/:id/review", requireEditor, async (c) => {
  const id = feedbackId(c.req.param("id"));
  const input = feedbackReviewSchema.parse(await c.req.json());
  const db = getDb(c.env);
  if (!await getFeedbackById(db, id)) throw notFound("Feedback not found.");
  await setFeedbackReviewStatus(db, id, input.reviewStatus);
  return ok(c, await getFeedbackById(db, id), "Feedback updated");
});

route.post("/:id/retry-notification", requireEditor, async (c) => {
  const id = feedbackId(c.req.param("id"));
  const db = getDb(c.env);
  if (!await getFeedbackById(db, id)) throw notFound("Feedback not found.");
  if (!await claimFeedbackNotification(db, id)) throw conflict("Notification is not eligible for retry.");
  const report = (await getFeedbackById(db, id))!;
  try {
    await sendFeedbackEmail(c.env, report);
    await setFeedbackNotificationStatus(db, id, "sent");
  } catch {
    await setFeedbackNotificationStatus(db, id, "failed");
    throw badGateway("Could not send feedback notification.");
  }
  return ok(c, await getFeedbackById(db, id), "Notification sent");
});

route.post("/:id/github-issue", requireEditor, async (c) => {
  const id = feedbackId(c.req.param("id"));
  const db = getDb(c.env);
  const report = await getFeedbackById(db, id);
  if (!report) throw notFound("Feedback not found.");
  if (!c.env.GITHUB_ISSUES_TOKEN) throw badGateway("GitHub issue creation is not configured.");
  if (!await claimFeedbackIssue(db, id)) throw conflict("An issue has already been created or is pending confirmation.");
  const result = await createFeedbackIssue(c.env, report);
  if (result.kind === "rejected") {
    await releaseFeedbackIssueClaim(db, id);
    throw badGateway("GitHub rejected the issue request.");
  }
  if (result.kind === "uncertain") {
    throw badGateway("GitHub issue status is uncertain. Check GitHub before trying again.");
  }
  await setFeedbackIssueCreated(db, id, result.url);
  return ok(c, await getFeedbackById(db, id), "GitHub issue created");
});

route.post("/:id/reset-github-issue", requireEditor, async (c) => {
  const id = feedbackId(c.req.param("id"));
  const db = getDb(c.env);
  if (!await getFeedbackById(db, id)) throw notFound("Feedback not found.");
  if (!await resetUncertainFeedbackIssue(db, id)) throw conflict("No uncertain issue attempt to reset.");
  return ok(c, await getFeedbackById(db, id), "GitHub issue attempt reset");
});

export default route;
