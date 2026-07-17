import { apiFetch } from "./api";
import type { VideoPlaybackDTO } from "@shared/dto";

export function fetchPlayback(mediaId: number): Promise<VideoPlaybackDTO> {
  return apiFetch<VideoPlaybackDTO>(`/api/media/${mediaId}/playback`);
}

export function streamIframeSrc(token: string): string {
  return `https://iframe.cloudflarestream.com/${token}`;
}
