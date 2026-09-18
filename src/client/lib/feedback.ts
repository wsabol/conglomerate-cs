import type { FeedbackDTO, FeedbackSubmissionDTO } from "@shared/dto";
import type { FeedbackCreateInput } from "@shared/schemas/feedback";
import type { ListResult } from "@shared/types";
import { apiFetch, toQuery } from "./api";

export function submitFeedback(input: FeedbackCreateInput) {
  return apiFetch<FeedbackSubmissionDTO>("/api/feedback", { method: "POST", body: JSON.stringify(input) });
}

export function listFeedback(params: { category?: string; reviewStatus?: string; limit?: number; beforeId?: number } = {}) {
  return apiFetch<ListResult<FeedbackDTO>>(`/api/feedback${toQuery(params)}`);
}

export function setFeedbackReviewed(id: number, reviewStatus: "open" | "reviewed") {
  return apiFetch<FeedbackDTO>(`/api/feedback/${id}/review`, { method: "PATCH", body: JSON.stringify({ reviewStatus }) });
}

export function retryFeedbackNotification(id: number) {
  return apiFetch<FeedbackDTO>(`/api/feedback/${id}/retry-notification`, { method: "POST" });
}

export function createFeedbackGitHubIssue(id: number) {
  return apiFetch<FeedbackDTO>(`/api/feedback/${id}/github-issue`, { method: "POST" });
}

export function resetFeedbackGitHubIssue(id: number) {
  return apiFetch<FeedbackDTO>(`/api/feedback/${id}/reset-github-issue`, { method: "POST" });
}
