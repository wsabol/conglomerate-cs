import { apiFetch } from "./api";
import type { RecentActivityDTO } from "@shared/dto";

export function getRecentActivity() {
  return apiFetch<RecentActivityDTO[]>("/api/stats/activity");
}
