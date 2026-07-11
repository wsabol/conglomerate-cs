import type { AppConfig } from "./config";

export interface InviteTokenBundle {
  rawToken: string;
  tokenHash: string;
  expiresAt: string;
}

export async function hashInviteToken(rawToken: string): Promise<string> {
  const data = new TextEncoder().encode(rawToken);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createInviteToken(
  config: AppConfig,
): Promise<InviteTokenBundle> {
  const rawToken = crypto.randomUUID();
  const tokenHash = await hashInviteToken(rawToken);
  const expiresAt = new Date(
    Date.now() + config.inviteTokenTtlDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  return { rawToken, tokenHash, expiresAt };
}

export function buildWelcomeUrl(appBaseUrl: string, rawToken: string): string {
  const base = appBaseUrl.replace(/\/$/, "");
  return `${base}/welcome?token=${encodeURIComponent(rawToken)}`;
}

export function isInviteExpired(expiresAt: string): boolean {
  return Date.now() > Date.parse(expiresAt);
}
