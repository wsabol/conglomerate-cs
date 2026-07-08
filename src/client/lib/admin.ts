import { apiFetch, toQuery } from "./api";
import type { RevisionDTO, UserDTO } from "@shared/dto";
import type { ListResult, RevisionTargetType, UserRole } from "@shared/types";
import type { UserUpdateInput } from "@shared/schemas/admin";

export function listUsers() {
  return apiFetch<ListResult<UserDTO>>("/api/admin/users");
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
