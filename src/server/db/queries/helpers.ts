import type { MediaAvailabilityDTO, PlaceDTO } from "@shared/dto";
import type { places } from "../schema";

export function emptyAvailability(): MediaAvailabilityDTO {
  return {
    photo: false,
    video: false,
    audio: false,
    setlist: false,
  };
}

export function localPart(email: string | null): string | null {
  if (!email) return null;
  return email.split("@")[0] ?? null;
}

export function toPlaceDTO(p: typeof places.$inferSelect): PlaceDTO {
  return {
    id: p.id,
    name: p.name,
    placeType: p.placeType,
    address: p.address,
    status: p.status,
  };
}
