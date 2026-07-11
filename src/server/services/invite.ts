import type { InviteDTO } from "@shared/dto";
import type { InviteCreateInput } from "@shared/schemas/invite";
import { addEmailToAccessPolicy } from "../auth/accessAdmin";
import {
  createInvite,
  markInviteFailed,
  markInviteSent,
} from "../db/mutations/invites";
import {
  getInviteById,
  getUserByEmail,
  hasRecentInvite,
} from "../db/queries/invites";
import type { Db } from "../db/client";
import type { Env } from "../env";
import { getConfig } from "../lib/config";
import {
  badGateway,
  conflict,
  tooManyRequests,
} from "../lib/errors";
import { buildWelcomeUrl } from "../lib/inviteToken";
import { sendInviteEmail } from "../mail/sendInvite";

export async function processInvite(
  db: Db,
  env: Env,
  input: InviteCreateInput,
  invitedByUserId: number,
  inviterEmail: string,
): Promise<InviteDTO> {
  const config = getConfig(env);

  if (await getUserByEmail(db, input.email)) {
    throw conflict("This email already belongs to a user.");
  }

  if (await hasRecentInvite(db, input.email, config.inviteThrottleHours)) {
    throw tooManyRequests(
      "An invite was already sent to this address in the last 24 hours.",
    );
  }

  try {
    await addEmailToAccessPolicy(env, input.email);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update Access allowlist.";
    throw badGateway(message);
  }

  const { id, rawToken } = await createInvite(db, env, input, invitedByUserId);
  const welcomeUrl = buildWelcomeUrl(config.appBaseUrl, rawToken);

  try {
    const providerMessageId = await sendInviteEmail(env, {
      to: input.email,
      inviteeName: input.name,
      inviterEmail,
      welcomeUrl,
    });
    await markInviteSent(db, id, providerMessageId);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to send invite email.";
    await markInviteFailed(db, id, message);
    throw badGateway(message);
  }

  const invite = await getInviteById(db, id);
  if (!invite) {
    throw badGateway("Invite was created but could not be loaded.");
  }
  return invite;
}
