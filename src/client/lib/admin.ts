import { apiFetch, toQuery } from "./api";
import type { InviteDTO, RevisionDTO, UserDTO } from "@shared/dto";
import type { InviteCreateInput } from "@shared/schemas/invite";
import type { ListResult, RevisionTargetType, UserRole } from "@shared/types";
import type { UserUpdateInput } from "@shared/schemas/admin";

export function listUsers() {
  return apiFetch<ListResult<UserDTO>>("/api/admin/users");
}

export function listInvites(params: { limit?: number } = {}) {
  return apiFetch<ListResult<InviteDTO>>(
    `/api/admin/invites${toQuery(params)}`,
  );
}

export function createInvite(body: InviteCreateInput) {
  return apiFetch<InviteDTO>("/api/admin/invites", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function verifyInviteToken(token: string) {
  return apiFetch<{ valid: true; inviteeName: string }>(
    `/api/invites/verify${toQuery({ token })}`,
  );
}

export function listRevisions(params: {
  target_type?: RevisionTargetType;
  target_id?: number;
  limit?: number;
} = {}) {
  return apiFetch<ListResult<RevisionDTO>>(
    `/api/admin/revisions${toQuery(params)}`,
  );
}

export function updateUser(id: number, body: UserUpdateInput) {
  return apiFetch<UserDTO>(`/api/admin/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function setUserRole(id: number, role: UserRole) {
  return updateUser(id, { role });
}

export function setUserDisabled(id: number, isDeleted: boolean) {
  return updateUser(id, { isDeleted });
}
