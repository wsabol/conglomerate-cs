import { apiFetch } from "./api";
import type { ListResult } from "@shared/types";

export function listActNames() {
  return apiFetch<ListResult<string>>("/api/acts");
}
