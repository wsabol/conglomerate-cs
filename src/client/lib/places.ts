import { apiFetch } from "./api";
import type { PlaceDTO } from "@shared/dto";
import type { ListResult } from "@shared/types";

export function listPlaces() {
  return apiFetch<ListResult<PlaceDTO>>("/api/places");
}

function placeTypeLabel(placeType: string | null): string {
  const normalized = placeType?.trim();
  if (!normalized) return "Other";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

/** Build place select options grouped by type, with untyped places last. */
export function placeSelectOptions(places: PlaceDTO[]) {
  return [...places]
    .map((place) => ({
      value: String(place.id),
      label: place.name,
      group: placeTypeLabel(place.placeType),
    }))
    .sort((a, b) => {
      if (a.group === "Other" && b.group !== "Other") return 1;
      if (b.group === "Other" && a.group !== "Other") return -1;
      return a.group.localeCompare(b.group) || a.label.localeCompare(b.label);
    });
}
