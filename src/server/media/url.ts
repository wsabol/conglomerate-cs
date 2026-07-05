// Authenticated media delivery URLs (served by GET /media/:id, Milestone 6).

export function mediaDeliveryUrl(id: number): string {
  return `/media/${id}`;
}

export function mediaThumbUrl(id: number): string {
  return `/media/${id}?variant=thumb`;
}

export function mediaDisplayUrl(id: number): string {
  return `/media/${id}?variant=display`;
}
