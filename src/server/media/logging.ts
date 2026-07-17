export interface ProcessingLogFields {
  mediaId?: number | string;
  streamUid?: string | null;
  r2Key?: string | null;
  operation: string;
  processingAttempt?: number;
  statusBefore?: string | null;
  statusAfter?: string | null;
  durationMs?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  ingestMethod?: string | null;
}

export function logProcessing(fields: ProcessingLogFields): void {
  console.log(
    JSON.stringify({
      type: "media_processing",
      ...fields,
    }),
  );
}
