import { and, eq } from "drizzle-orm";
import type { FeedbackCreateInput } from "@shared/schemas/feedback";
import type { Db } from "../client";
import { feedback } from "../schema";

export async function createFeedback(db: Db, input: FeedbackCreateInput, userId: number): Promise<number> {
  const row = await db.insert(feedback).values({
    submittedBy: userId,
    category: input.category,
    message: input.message,
    whatHappened: input.category === "bug" ? input.whatHappened || null : null,
    reproductionSteps: input.category === "bug" ? input.reproductionSteps || null : null,
    pagePath: input.pagePath,
  }).returning({ id: feedback.id }).get();
  return row.id;
}

export async function setFeedbackNotificationStatus(db: Db, id: number, status: "sent" | "failed"): Promise<void> {
  await db.update(feedback).set({ notificationStatus: status }).where(eq(feedback.id, id));
}

export async function claimFeedbackNotification(db: Db, id: number): Promise<boolean> {
  const row = await db.update(feedback).set({ notificationStatus: "pending" })
    .where(and(eq(feedback.id, id), eq(feedback.notificationStatus, "failed")))
    .returning({ id: feedback.id }).get();
  return Boolean(row);
}

export async function setFeedbackReviewStatus(db: Db, id: number, reviewStatus: "open" | "reviewed"): Promise<void> {
  await db.update(feedback).set({ reviewStatus }).where(eq(feedback.id, id));
}

export async function claimFeedbackIssue(db: Db, id: number): Promise<boolean> {
  const row = await db.update(feedback).set({ issueStatus: "creating" })
    .where(and(eq(feedback.id, id), eq(feedback.issueStatus, "none")))
    .returning({ id: feedback.id }).get();
  return Boolean(row);
}

export async function setFeedbackIssueCreated(db: Db, id: number, url: string): Promise<void> {
  await db.update(feedback).set({ issueStatus: "created", issueUrl: url, reviewStatus: "reviewed" })
    .where(and(eq(feedback.id, id), eq(feedback.issueStatus, "creating")));
}

export async function releaseFeedbackIssueClaim(db: Db, id: number): Promise<void> {
  await db.update(feedback).set({ issueStatus: "none" })
    .where(and(eq(feedback.id, id), eq(feedback.issueStatus, "creating")));
}

export async function resetUncertainFeedbackIssue(db: Db, id: number): Promise<boolean> {
  const row = await db.update(feedback).set({ issueStatus: "none" })
    .where(and(eq(feedback.id, id), eq(feedback.issueStatus, "creating")))
    .returning({ id: feedback.id }).get();
  return Boolean(row);
}
