import { describe, expect, it } from "vitest";
import {
  fileMatchesAccept,
  filesFromClipboard,
  isEditablePasteTarget,
} from "../../src/client/lib/fileInput";

function pngFile(name: string, type = "image/png"): File {
  return new File([new Uint8Array([0x89, 0x50])], name, { type });
}

describe("fileMatchesAccept", () => {
  it("allows any file when accept is omitted", () => {
    expect(fileMatchesAccept(pngFile("shot.png"))).toBe(true);
  });

  it("matches image wildcards", () => {
    expect(fileMatchesAccept(pngFile("shot.png"), "image/*")).toBe(true);
    expect(
      fileMatchesAccept(
        new File(["x"], "clip.mp4", { type: "video/mp4" }),
        "image/*",
      ),
    ).toBe(false);
  });

  it("matches exact MIME types and extensions", () => {
    expect(
      fileMatchesAccept(pngFile("notes.pdf", "application/pdf"), "application/pdf"),
    ).toBe(true);
    expect(fileMatchesAccept(pngFile("shot.png"), ".png,video/*")).toBe(true);
  });
});

describe("filesFromClipboard", () => {
  it("reads image files from clipboard items", () => {
    const pasted = pngFile("image.png");
    const files = filesFromClipboard({
      items: [
        {
          kind: "file",
          getAsFile: () => pasted,
        },
      ],
    });
    expect(files).toHaveLength(1);
    expect(files[0]?.name).toBe("image.png");
  });

  it("names unnamed clipboard blobs", () => {
    const pasted = new File([new Uint8Array([1, 2, 3])], "", {
      type: "image/png",
    });
    const files = filesFromClipboard({
      files: [pasted],
    });
    expect(files[0]?.name).toBe("pasted-image.png");
    expect(files[0]?.type).toBe("image/png");
  });

  it("prefers items over the files list", () => {
    const fromItem = pngFile("from-item.png");
    const fromFiles = pngFile("from-files.png");
    const files = filesFromClipboard({
      items: [{ kind: "file", getAsFile: () => fromItem }],
      files: [fromFiles],
    });
    expect(files.map((file) => file.name)).toEqual(["from-item.png"]);
  });
});

describe("isEditablePasteTarget", () => {
  it("returns false for non-elements", () => {
    expect(isEditablePasteTarget(null)).toBe(false);
  });

  it("treats inputs and contenteditable nodes as editable", () => {
    expect(
      isEditablePasteTarget({ tagName: "INPUT" } as unknown as EventTarget),
    ).toBe(true);
    expect(
      isEditablePasteTarget({
        isContentEditable: true,
        tagName: "DIV",
      } as unknown as EventTarget),
    ).toBe(true);
    expect(
      isEditablePasteTarget({ tagName: "DIV" } as unknown as EventTarget),
    ).toBe(false);
  });
});
