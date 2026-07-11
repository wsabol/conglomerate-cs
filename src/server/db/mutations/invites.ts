import { eq } from "drizzle-orm";
import type { InviteCreateInput } from "@shared/schemas/invite";
import type { Db } from "../client";
import { invites } from "../schema";
import { createInviteToken } from "../../lib/inviteToken";
import { getConfig } from "../../lib/config";
import type { Env } from "../../env";

export interface CreatedInvite {
  id: number;
  rawToken: string;
}

export async function createInvite(
  db: Db,
  env: Env,
  input: InviteCreateInput,
  invitedByUserId: number,
): Promise<CreatedInvite> {
  const config = getConfig(env);
  const { rawToken, tokenHash, expiresAt } = await createInviteToken(config);

  const inserted = await db
    .insert(invites)
    .values({
      email: input.email,
      inviteeName: input.name,
      invitedBy: invitedByUserId,
      tokenHash,
      tokenExpiresAt: expiresAt,
      status: "pending",
    })
    .returning({ id: invites.id })
    .get();

  return { id: inserted.id, rawToken };
}

export async function markInviteSent(
  db: Db,
  id: number,
  providerMessageId: string,
): Promise<void> {
  await db
    .update(invites)
    .set({
      status: "sent",
      providerMessageId,
      errorMessage: null,
    })
    .where(eq(invites.id, id));
}

export async function markInviteFailed(
  db: Db,
  id: number,
  errorMessage: string,
): Promise<void> {
  await db
    .update(invites)
    .set({
      status: "failed",
      errorMessage,
    })
    .where(eq(invites.id, id));
}
