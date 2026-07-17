// Authenticated media delivery URLs (served by GET /media/:id, Milestone 6).

export function mediaDeliveryUrl(id: number): string {
  return `/media/${id}`;
}

export function mediaOriginalUrl(id: number): string {
  return `/media/${id}?variant=original`;
}

export function mediaThumbUrl(id: number): string {
  return `/media/${id}?variant=thumb`;
}

export function mediaDisplayUrl(id: number): string {
  return `/media/${id}?variant=display`;
}

export function mediaThumbnailApiUrl(id: number): string {
  return `/api/media/${id}/thumbnail`;
}

export function mediaPlaybackApiUrl(id: number): string {
  return `/api/media/${id}/playback`;
}
