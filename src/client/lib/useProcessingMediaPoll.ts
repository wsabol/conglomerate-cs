import { useEffect, useRef } from "react";
import type { MediaItemDTO } from "@shared/dto";
import { apiFetch } from "./api";

const PROCESSING_STATUSES = new Set([
  "uploading",
  "uploaded",
  "processing",
]);

function isProcessing(item: MediaItemDTO): boolean {
  return item.mediaType === "video" && PROCESSING_STATUSES.has(item.status);
}

function pollIntervalMs(elapsedMs: number): number {
  return elapsedMs < 60_000 ? 5_000 : 15_000;
}

/**
 * Poll media items while any visible video is still processing.
 */
export function useProcessingMediaPoll(
  items: MediaItemDTO[],
  onUpdate: (items: MediaItemDTO[]) => void,
) {
  const startedAt = useRef(Date.now());
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    const processing = items.filter(isProcessing);
    if (processing.length === 0) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      if (cancelled || document.hidden) {
        schedule();
        return;
      }

      const current = itemsRef.current.filter(isProcessing);
      if (current.length === 0) return;

      const refreshed = await Promise.all(
        current.map(async (item) => {
          try {
            return await apiFetch<MediaItemDTO>(`/api/media/${item.id}`);
          } catch {
            return item;
          }
        }),
      );

      if (cancelled) return;

      const byId = new Map(refreshed.map((item) => [item.id, item]));
      onUpdate(
        itemsRef.current.map((item) => byId.get(item.id) ?? item),
      );

      schedule();
    }

    function schedule() {
      if (cancelled) return;
      const elapsed = Date.now() - startedAt.current;
      timer = setTimeout(poll, pollIntervalMs(elapsed));
    }

    function onFocus() {
      if (!cancelled) void poll();
    }

    document.addEventListener("visibilitychange", schedule);
    window.addEventListener("focus", onFocus);
    schedule();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
      window.removeEventListener("focus", onFocus);
    };
  }, [items, onUpdate]);
}
