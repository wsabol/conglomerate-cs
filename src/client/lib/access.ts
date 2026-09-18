import type { AccessLoginDTO } from "@shared/dto";
import { apiFetch, toQuery } from "./api";

export function getAccessLogin(next: string | null) {
  return apiFetch<AccessLoginDTO>(`/api/auth/login${toQuery({ next })}`);
}
