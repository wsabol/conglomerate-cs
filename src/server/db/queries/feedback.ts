import { and, desc, eq, lt } from "drizzle-orm";
import type { FeedbackDTO } from "@shared/dto";
import type { feedbackListQuerySchema } from "@shared/schemas/feedback";
import type { z } from "zod";
import type { Db } from "../client";
import { feedback, users } from "../schema";

const fields = {
  id: feedback.id,
  category: feedback.category,
  message: feedback.message,
  whatHappened: feedback.whatHappened,
  reproductionSteps: feedback.reproductionSteps,
  pagePath: feedback.pagePath,
  submitterEmail: users.email,
  notificationStatus: feedback.notificationStatus,
  reviewStatus: feedback.reviewStatus,
  issueStatus: feedback.issueStatus,
  issueUrl: feedback.issueUrl,
  createdOn: feedback.createdOn,
};

export async function getFeedbackById(db: Db, id: number): Promise<FeedbackDTO | null> {
  return await db.select(fields).from(feedback).innerJoin(users, eq(users.id, feedback.submittedBy))
    .where(eq(feedback.id, id)).get() ?? null;
}

export async function listFeedback(db: Db, q: z.infer<typeof feedbackListQuerySchema>): Promise<FeedbackDTO[]> {
  const conditions = [];
  if (q.category) conditions.push(eq(feedback.category, q.category));
  if (q.reviewStatus) conditions.push(eq(feedback.reviewStatus, q.reviewStatus));
  if (q.beforeId) conditions.push(lt(feedback.id, q.beforeId));
  return db.select(fields).from(feedback).innerJoin(users, eq(users.id, feedback.submittedBy))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(feedback.id)).limit(q.limit);
}
