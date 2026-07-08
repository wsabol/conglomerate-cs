import { apiFetch, toQuery } from "./api";
import type { MediaItemDTO } from "@shared/dto";
import type { ListResult, MediaType } from "@shared/types";
import type { UploadCreateInput } from "@shared/schemas/media";

export interface ListMediaParams {
  media_type?: MediaType;
  year?: string | number;
  person?: string | number;
}

export function listMedia(params: ListMediaParams = {}) {
  return apiFetch<ListResult<MediaItemDTO>>(
    `/api/media${toQuery(
      params as Record<string, string | number | undefined | null>,
    )}`,
  );
}

export interface UploadTarget {
  mediaId: number;
  uploadUrl: string;
  uploadMethod: "PUT";
  directUpload: boolean;
}

/** Request an upload slot and push the file to R2 (or the dev proxy). */
export async function uploadFile(
  eventId: number,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<MediaItemDTO> {
  const init = await apiFetch<UploadTarget>("/api/uploads", {
    method: "POST",
    body: JSON.stringify({
      eventId,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      title: file.name,
    } satisfies UploadCreateInput),
  });

  await putWithProgress(init.uploadUrl, file, init.uploadMethod, onProgress);

  return apiFetch<MediaItemDTO>(`/api/uploads/${init.mediaId}/complete`, {
    method: "POST",
  });
}

function putWithProgress(
  url: string,
  file: File,
  method: "PUT",
  onProgress?: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Upload failed."));
    xhr.send(file);
  });
}

export async function deleteMedia(id: number): Promise<void> {
  await apiFetch(`/api/media/${id}`, { method: "DELETE" });
}
