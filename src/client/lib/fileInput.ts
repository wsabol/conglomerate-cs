export interface ClipboardFileSource {
  files?: ArrayLike<File>;
  items?: ArrayLike<{
    kind: string;
    getAsFile: () => File | null;
  }>;
}

const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
};

export function fileMatchesAccept(file: File, accept?: string): boolean {
  if (!accept) return true;
  const tokens = accept
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;

  const mime = (file.type || "").split(";")[0]!.trim().toLowerCase();
  const name = file.name.toLowerCase();

  return tokens.some((token) => {
    if (token === "*" || token === "*/*") return true;
    if (token.startsWith(".")) return name.endsWith(token);
    if (token.endsWith("/*")) return mime.startsWith(token.slice(0, -1));
    return mime === token;
  });
}

export function filesFromClipboard(
  data: ClipboardFileSource | null | undefined,
): File[] {
  if (!data) return [];

  const fromItems: File[] = [];
  if (data.items) {
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i]!;
      if (item.kind !== "file") continue;
      const file = item.getAsFile();
      if (file) fromItems.push(normalizePastedFile(file));
    }
  }
  if (fromItems.length) return fromItems;

  if (!data.files || data.files.length === 0) return [];
  return Array.from(data.files, normalizePastedFile);
}

export function isEditablePasteTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as Partial<HTMLElement> & {
    closest?: (selector: string) => unknown;
  };
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return Boolean(
    el.closest?.("[contenteditable='true'], [contenteditable='']"),
  );
}

function normalizePastedFile(file: File): File {
  if (file.name && file.name !== "blob") return file;
  const ext = extensionForMime(file.type);
  return new File([file], `pasted-image.${ext}`, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

function extensionForMime(mime: string): string {
  const normalized = mime.split(";")[0]!.trim().toLowerCase();
  if (MIME_EXTENSIONS[normalized]) return MIME_EXTENSIONS[normalized];
  const subtype = normalized.split("/")[1];
  if (subtype && /^[a-z0-9]+$/i.test(subtype)) return subtype;
  return "png";
}
