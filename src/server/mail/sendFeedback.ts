import type { FeedbackDTO } from "@shared/dto";
import type { Env } from "../env";
import { getConfig } from "../lib/config";

export async function sendFeedbackEmail(env: Env, report: FeedbackDTO): Promise<void> {
  if (!env.RESEND_API_KEY) throw new Error("Feedback email is not configured.");
  const config = getConfig(env);
  const subject = `[Conglomerate feedback #${report.id}] ${report.category === "bug" ? "Bug" : report.category === "suggestion" ? "Suggestion" : "Praise / other"}`;
  const lines = [
    `Feedback #${report.id}`,
    `Type: ${report.category}`,
    `From: ${report.submitterEmail}`,
    `Page: ${report.pagePath}`,
    `Submitted: ${report.createdOn}`,
    "",
    report.message,
  ];
  if (report.whatHappened) lines.push("", "What happened:", report.whatHappened);
  if (report.reproductionSteps) lines.push("", "How to reproduce:", report.reproductionSteps);
  lines.push("", `Review: ${config.appBaseUrl.replace(/\/$/, "")}/admin?tab=feedback`);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `feedback-notification-${report.id}`,
    },
    body: JSON.stringify({
      from: config.feedbackFromEmail,
      to: [config.feedbackToEmail],
      subject,
      text: lines.join("\n"),
    }),
  });
  if (!response.ok) throw new Error("Feedback email delivery failed.");
}
