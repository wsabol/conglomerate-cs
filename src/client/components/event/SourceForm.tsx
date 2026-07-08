import { useState } from "react";
import { Button } from "../ui/Button";
import { FileInput, RadioGroup, TextArea, TextField } from "../form";
import modalStyles from "../form/modal.module.css";
import { uploadFile } from "../../lib/media";
import { eventSourceInputSchema } from "@shared/schemas/event";
import { SOURCE_TYPES, type SourceType } from "@shared/types";
import { zodFieldErrors } from "../../lib/zodErrors";
import styles from "./SourceForm.module.css";

export interface SourceFormValue {
  sourceType: SourceType;
  description: string;
  url: string;
  mediaId: number | null;
  mediaUrl: string | null;
}

const TYPE_OPTIONS = SOURCE_TYPES.map((value) => ({
  value,
  label: value === "url" ? "Link" : value === "media" ? "Image" : "Text",
}));

const FACEBOOK_EVENT_CAPTION = "Facebook event page";

function isFacebookEventUrl(value: string): boolean {
  return value.toLowerCase().includes("facebook.com/events");
}

function toSourceInput(value: SourceFormValue) {
  return {
    sourceType: value.sourceType,
    description: value.description || null,
    url: value.sourceType === "url" ? value.url || null : null,
    mediaId: value.sourceType === "media" ? value.mediaId : null,
  };
}

interface SourceFormProps {
  eventId: number;
  initial?: Partial<SourceFormValue>;
  submitLabel: string;
  inModal?: boolean;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (value: SourceFormValue) => void;
  onCancel?: () => void;
}

export function SourceForm({
  eventId,
  initial,
  submitLabel,
  inModal = false,
  submitting,
  error,
  onSubmit,
  onCancel,
}: SourceFormProps) {
  const [sourceType, setSourceType] = useState<SourceType>(
    initial?.sourceType ?? "url",
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [mediaId, setMediaId] = useState<number | null>(initial?.mediaId ?? null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(
    initial?.mediaUrl ?? null,
  );
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const formClass = inModal ? modalStyles.modalForm : styles.form;
  const actionsClass = inModal ? modalStyles.modalActions : styles.actions;
  const errorClass = inModal ? modalStyles.modalError : styles.error;

  async function handleUpload(files: FileList) {
    const file = files[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      setUploadProgress(0);
      const item = await uploadFile(eventId, file, setUploadProgress);
      if (item.mediaType !== "photo") {
        throw new Error("Source image must be a photo.");
      }
      setMediaId(item.id);
      setMediaUrl(item.url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  function handleTypeChange(next: string) {
    const type = next as SourceType;
    setSourceType(type);
    setValidationError(null);
    if (type !== "url") setUrl("");
    if (type !== "media") {
      setMediaId(null);
      setMediaUrl(null);
    }
  }

  function handleUrlChange(nextUrl: string) {
    setUrl(nextUrl);
    if (!description.trim() && isFacebookEventUrl(nextUrl)) {
      setDescription(FACEBOOK_EVENT_CAPTION);
    }
  }

  return (
    <form
      className={formClass}
      onSubmit={(e) => {
        e.preventDefault();
        if (sourceType === "media" && !mediaId) {
          setValidationError("Upload an image.");
          return;
        }
        const parsed = eventSourceInputSchema.safeParse(toSourceInput({
          sourceType,
          description,
          url,
          mediaId,
          mediaUrl,
        }));
        if (!parsed.success) {
          const errors = zodFieldErrors(parsed.error);
          setValidationError(
            errors.url ?? errors.description ?? "Fix the highlighted fields.",
          );
          return;
        }
        setValidationError(null);
        onSubmit({
          sourceType,
          description: description.trim(),
          url: url.trim(),
          mediaId,
          mediaUrl,
        });
      }}
    >
      <RadioGroup
        legend="Source type"
        name="source-type"
        value={sourceType}
        onChange={handleTypeChange}
        options={TYPE_OPTIONS}
      />

      {sourceType === "text" ? (
        <TextArea
          label="Source text"
          placeholder="Paste or type the citation..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={inModal ? 5 : 4}
          required
        />
      ) : (
        <>
          <TextField
            label="Title or caption"
            placeholder={
              sourceType === "url"
                ? "e.g. Facebook event page"
                : "Optional caption for the screenshot"
            }
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          {sourceType === "url" && (
            <TextField
              label="URL"
              type="url"
              placeholder="https://..."
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              required
            />
          )}

          {sourceType === "media" && (
            <>
              {mediaUrl ? (
                <div className={styles.preview}>
                  <img className={styles.previewImage} src={mediaUrl} alt="" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setMediaId(null);
                      setMediaUrl(null);
                    }}
                  >
                    Remove image
                  </Button>
                </div>
              ) : (
                <>
                  <FileInput
                    label={
                      uploading ? "Uploading…" : "Choose an image or drag it here"
                    }
                    accept="image/*"
                    onFiles={handleUpload}
                  />
                  {uploadProgress !== null && (
                    <div
                      className={styles.progress}
                      role="progressbar"
                      aria-valuenow={uploadProgress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className={styles.progressBar}
                        style={{ width: `${uploadProgress}%` }}
                      />
                      <span className={styles.progressLabel}>{uploadProgress}%</span>
                    </div>
                  )}
                </>
              )}
              {uploadError && (
                <p className={errorClass} role="alert">
                  {uploadError}
                </p>
              )}
            </>
          )}
        </>
      )}

      {(validationError || error) && (
        <p className={errorClass} role="alert">
          {validationError ?? error}
        </p>
      )}

      <div className={actionsClass}>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={submitting || uploading}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
