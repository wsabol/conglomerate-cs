import { useEffect, useMemo, useState } from "react";
import { TextArea } from "../form";
import { patchEvent, performancePatch } from "../../lib/events";
import type { EventDetailDTO } from "@shared/dto";
import { EditableSidebarSection } from "./EditableSidebarSection";
import { EditorModalForm } from "./EditorModalForm";
import { useEditorModal } from "./useEditorModal";

interface SetlistSectionProps {
  event: EventDetailDTO;
  isEditor: boolean;
  onReload: () => void;
}

function parseSetlistLines(setlistText: string | null | undefined): string[] {
  return (
    setlistText
      ?.split("\n")
      .map((line) => line.trim())
      .filter(Boolean) ?? []
  );
}

export function SetlistSection({
  event,
  isEditor,
  onReload,
}: SetlistSectionProps) {
  const setlistLines = useMemo(
    () => parseSetlistLines(event.performance?.setlistText),
    [event.performance?.setlistText],
  );

  return (
    <EditableSidebarSection
      title="Setlist"
      items={setlistLines}
      isEditor={isEditor}
      emptyMessage="No setlist recorded yet."
      addLabel="Add setlist"
      editLabel="Edit setlist"
      getItemKey={(song) => song}
      renderItem={(song) => song}
      onReload={onReload}
      renderModal={(modalProps) => (
        <SetlistModal event={event} {...modalProps} />
      )}
    />
  );
}

function SetlistModal({
  event,
  open,
  onClose,
  onSaved,
}: {
  event: EventDetailDTO;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [setlistText, setSetlistText] = useState("");
  const { submitting, error, save } = useEditorModal(open);

  useEffect(() => {
    if (!open) return;
    setSetlistText(event.performance?.setlistText ?? "");
  }, [open, event.performance?.setlistText]);

  async function handleSubmit() {
    const ok = await save(async () => {
      await patchEvent(event.slug, {
        performance: performancePatch(event, {
          setlistText: setlistText.trim() || null,
        }),
      });
    }, "Could not save setlist.");
    if (ok) onSaved();
  }

  return (
    <EditorModalForm
      open={open}
      onClose={onClose}
      title="Setlist"
      submitLabel="Save setlist"
      submitting={submitting}
      error={error}
      onSubmit={handleSubmit}
    >
      <TextArea
        label="Songs"
        hint="One song per line"
        value={setlistText}
        onChange={(e) => setSetlistText(e.target.value)}
        rows={10}
      />
    </EditorModalForm>
  );
}
