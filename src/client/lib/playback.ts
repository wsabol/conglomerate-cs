import { apiFetch } from "./api";
import type { VideoPlaybackDTO } from "@shared/dto";

export function fetchPlayback(mediaId: number): Promise<VideoPlaybackDTO> {
  return apiFetch<VideoPlaybackDTO>(`/api/media/${mediaId}/playback`);
}

export function streamIframeSrc(token: string): string {
  return `https://iframe.cloudflarestream.com/${token}`;
}

export function streamHlsSrc(customerCode: string, token: string): string {
  return `https://customer-${customerCode}.cloudflarestream.com/${token}/manifest/video.m3u8`;
}
