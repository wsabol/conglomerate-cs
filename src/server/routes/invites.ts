import { Hono } from "hono";
import type { AppEnv } from "../env";
import { getDb } from "../db/client";
import { getInviteByTokenHash } from "../db/queries/invites";
import { inviteVerifyQuerySchema } from "@shared/schemas/invite";
import { ok } from "../lib/response";
import { notFound } from "../lib/errors";
import { hashInviteToken, isInviteExpired } from "../lib/inviteToken";

const route = new Hono<AppEnv>();

route.get("/verify", async (c) => {
  const { token } = inviteVerifyQuerySchema.parse(c.req.query());
  const tokenHash = await hashInviteToken(token);
  const invite = await getInviteByTokenHash(getDb(c.env), tokenHash);

  if (!invite || invite.status !== "sent" || isInviteExpired(invite.tokenExpiresAt)) {
    throw notFound("This invite link is invalid or has expired.");
  }

  return ok(
    c,
    { valid: true as const, inviteeName: invite.inviteeName },
    "Invite verified",
  );
});

export default route;
