import { and, desc, eq, gte } from "drizzle-orm";
import type { InviteDTO } from "@shared/dto";
import type { Db } from "../client";
import { invites, users } from "../schema";

export async function getUserByEmail(
  db: Db,
  email: string,
): Promise<{ id: number } | null> {
  const normalized = email.trim().toLowerCase();
  const row = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalized))
    .get();
  return row ?? null;
}

export async function hasRecentInvite(
  db: Db,
  email: string,
  withinHours: number,
): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const cutoff = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString();
  const row = await db
    .select({ id: invites.id })
    .from(invites)
    .where(
      and(
        eq(invites.email, normalized),
        eq(invites.status, "sent"),
        gte(invites.createdOn, cutoff),
      ),
    )
    .get();
  return Boolean(row);
}

export async function listInvites(db: Db, limit: number): Promise<InviteDTO[]> {
  const rows = await db
    .select({
      id: invites.id,
      email: invites.email,
      inviteeName: invites.inviteeName,
      invitedByEmail: users.email,
      status: invites.status,
      createdOn: invites.createdOn,
    })
    .from(invites)
    .innerJoin(users, eq(invites.invitedBy, users.id))
    .orderBy(desc(invites.createdOn))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    inviteeName: row.inviteeName,
    invitedByEmail: row.invitedByEmail,
    status: row.status,
    createdOn: row.createdOn,
  }));
}

export async function getInviteByTokenHash(
  db: Db,
  tokenHash: string,
): Promise<{ inviteeName: string; tokenExpiresAt: string; status: string } | null> {
  const row = await db
    .select({
      inviteeName: invites.inviteeName,
      tokenExpiresAt: invites.tokenExpiresAt,
      status: invites.status,
    })
    .from(invites)
    .where(eq(invites.tokenHash, tokenHash))
    .get();
  return row ?? null;
}

export async function getInviteById(db: Db, id: number): Promise<InviteDTO | null> {
  const row = await db
    .select({
      id: invites.id,
      email: invites.email,
      inviteeName: invites.inviteeName,
      invitedByEmail: users.email,
      status: invites.status,
      createdOn: invites.createdOn,
    })
    .from(invites)
    .innerJoin(users, eq(invites.invitedBy, users.id))
    .where(eq(invites.id, id))
    .get();

  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    inviteeName: row.inviteeName,
    invitedByEmail: row.invitedByEmail,
    status: row.status,
    createdOn: row.createdOn,
  };
}
