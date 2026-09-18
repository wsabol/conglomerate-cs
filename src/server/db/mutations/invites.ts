import { eq } from "drizzle-orm";
import type { InviteCreateInput } from "@shared/schemas/invite";
import type { Db } from "../client";
import { invites } from "../schema";

export async function createInvite(
  db: Db,
  input: InviteCreateInput,
  invitedByUserId: number,
): Promise<number> {
  const inserted = await db
    .insert(invites)
    .values({
      email: input.email,
      inviteeName: input.name,
      invitedBy: invitedByUserId,
      status: "pending",
    })
    .returning({ id: invites.id })
    .get();

  return inserted.id;
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
