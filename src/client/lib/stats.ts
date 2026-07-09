import { apiFetch } from "./api";
import type { ArchiveStatsDTO } from "@shared/dto";

export function getArchiveStats() {
  return apiFetch<ArchiveStatsDTO>("/api/stats");
}
