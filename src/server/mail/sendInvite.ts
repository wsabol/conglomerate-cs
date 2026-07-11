import type { Env } from "../env";
import { getConfig } from "../lib/config";
import {
  renderInviteEmailHtml,
  renderInviteEmailText,
  type InviteEmailContent,
} from "./templates/inviteEmail";

interface ResendResponse {
  id?: string;
  message?: string;
}

export async function sendInviteEmail(
  env: Env,
  content: InviteEmailContent,
): Promise<string> {
  const config = getConfig(env);
  const apiKey = env.RESEND_API_KEY;

  if (!apiKey) {
    console.info(
      `[invite] Skipping Resend — no RESEND_API_KEY. Would email ${content.to} with welcome URL ${content.welcomeUrl}`,
    );
    return "dev-stub";
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.inviteFromEmail,
      to: [content.to],
      subject: "You're invited to The Conglomerate",
      html: renderInviteEmailHtml(content),
      text: renderInviteEmailText(content),
    }),
  });

  const body = (await res.json()) as ResendResponse;
  if (!res.ok) {
    throw new Error(body.message ?? `Resend API failed (${res.status}).`);
  }
  if (!body.id) {
    throw new Error("Resend API returned no message id.");
  }
  return body.id;
}
