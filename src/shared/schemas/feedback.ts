import { z } from "zod";

export const FEEDBACK_CATEGORIES = ["bug", "suggestion", "praise_other"] as const;
export const FEEDBACK_REVIEW_STATUSES = ["open", "reviewed"] as const;
export const FEEDBACK_NOTIFICATION_STATUSES = ["pending", "sent", "failed"] as const;
export const FEEDBACK_ISSUE_STATUSES = ["none", "creating", "created"] as const;

export const feedbackCreateSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES),
  message: z.string().trim().min(1, "Please enter your feedback.").max(5000),
  whatHappened: z.string().trim().max(2000).optional(),
  reproductionSteps: z.string().trim().max(2000).optional(),
  pagePath: z.string().min(1).max(500).regex(/^\/(?!\/)[^?#]*$/, "Invalid page path."),
}).strict();
export type FeedbackCreateInput = z.infer<typeof feedbackCreateSchema>;

export const feedbackListQuerySchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES).optional(),
  reviewStatus: z.enum(FEEDBACK_REVIEW_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  beforeId: z.coerce.number().int().positive().optional(),
});

export const feedbackReviewSchema = z.object({
  reviewStatus: z.enum(FEEDBACK_REVIEW_STATUSES),
}).strict();
