import { apiFetch } from "./api";
import type { PlaceDTO } from "@shared/dto";
import type { ListResult } from "@shared/types";

export function listPlaces() {
  return apiFetch<ListResult<PlaceDTO>>("/api/places");
}
