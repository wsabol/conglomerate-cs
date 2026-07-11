import { z } from "zod";

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export const inviteCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .transform(normalizeEmail),
});
export type InviteCreateInput = z.infer<typeof inviteCreateSchema>;

export const invitesListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type InvitesListQuery = z.infer<typeof invitesListQuerySchema>;

export const inviteVerifyQuerySchema = z.object({
  token: z.string().trim().min(1, "Invite token is required."),
});
export type InviteVerifyQuery = z.infer<typeof inviteVerifyQuerySchema>;
