import type { FeedbackDTO } from "@shared/dto";
import type { Env } from "../env";
import { getConfig } from "../lib/config";

export type IssueResult = { kind: "created"; url: string } | { kind: "rejected" } | { kind: "uncertain" };

export async function createFeedbackIssue(env: Env, report: FeedbackDTO): Promise<IssueResult> {
  const token = env.GITHUB_ISSUES_TOKEN;
  if (!token) return { kind: "rejected" };
  const repo = getConfig(env).githubIssuesRepo;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { kind: "rejected" };
  const category = report.category === "bug" ? "Bug" : report.category === "suggestion" ? "Suggestion" : "Feedback";
  const summary = report.message.replace(/\s+/g, " ").slice(0, 80);
  const body = [
    `Source: Conglomerate feedback #${report.id}`,
    `Type: ${category}`,
    `Page: ${report.pagePath}`,
    "",
    "## Report",
    report.message,
  ];
  if (report.whatHappened) body.push("", "## What happened", report.whatHappened);
  if (report.reproductionSteps) body.push("", "## How to reproduce", report.reproductionSteps);

  let response: Response;
  try {
    response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "conglomerate-feedback",
      },
      body: JSON.stringify({ title: `[${category}] ${summary}`, body: body.join("\n") }),
    });
  } catch {
    return { kind: "uncertain" };
  }
  if (!response.ok) return response.status >= 500 ? { kind: "uncertain" } : { kind: "rejected" };
  try {
    const result = await response.json() as { html_url?: string };
    if (result.html_url && result.html_url.startsWith(`https://github.com/${repo}/issues/`)) {
      return { kind: "created", url: result.html_url };
    }
  } catch {
    // GitHub may have created the issue despite an unreadable response.
  }
  return { kind: "uncertain" };
}
