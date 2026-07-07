import { useEffect, useMemo, useState } from "react";
import { AutocompleteInput } from "../form";
import { Icon } from "../ui/Icon";
import { apiFetch } from "../../lib/api";
import { patchEvent } from "../../lib/events";
import { useAsync } from "../../lib/useAsync";
import type { EventDetailDTO } from "@shared/dto";
import type { ListResult } from "@shared/types";
import { EditableSidebarSection } from "./EditableSidebarSection";
import { EditorModalForm } from "./EditorModalForm";
import { useEditorModal } from "./useEditorModal";
import styles from "../form/modal.module.css";

interface OtherActsSectionProps {
  event: EventDetailDTO;
  isEditor: boolean;
  onReload: () => void;
}

export function OtherActsSection({
  event,
  isEditor,
  onReload,
}: OtherActsSectionProps) {
  return (
    <EditableSidebarSection
      title="Acts on the bill"
      items={event.acts}
      isEditor={isEditor}
      emptyMessage="No acts listed yet."
      addLabel="Add acts"
      editLabel="Edit acts"
      getItemKey={(act) => act.id}
      renderItem={(act) => act.name}
      onReload={onReload}
      renderModal={(modalProps) => (
        <OtherActsModal event={event} {...modalProps} />
      )}
    />
  );
}

function OtherActsModal({
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
  const [draftActs, setDraftActs] = useState<string[]>([]);
  const { submitting, error, save } = useEditorModal(open);

  const { data: actsData } = useAsync(
    () =>
      open
        ? apiFetch<ListResult<string>>("/api/acts")
        : Promise.resolve(null),
    [open],
  );

  const suggestions = useMemo(
    () => actsData?.results ?? [],
    [actsData],
  );

  useEffect(() => {
    if (!open) return;
    setDraftActs(event.acts.map((act) => act.name));
  }, [open, event.acts]);

  async function handleSubmit() {
    const ok = await save(async () => {
      await patchEvent(event.slug, {
        acts: draftActs.map((name) => ({ name, billingRole: "unknown" })),
      });
    }, "Could not save acts.");
    if (ok) onSaved();
  }

  return (
    <EditorModalForm
      open={open}
      onClose={onClose}
      title="Acts on the bill"
      submitLabel="Save acts"
      submitting={submitting}
      error={error}
      onSubmit={handleSubmit}
    >
      {draftActs.length > 0 && (
        <ul className={styles.modalList}>
          {draftActs.map((name) => (
            <li key={name}>
              <span>{name}</span>
              <button
                type="button"
                className={styles.modalRemove}
                onClick={() =>
                  setDraftActs((current) =>
                    current.filter((entry) => entry !== name),
                  )
                }
                aria-label={`Remove ${name}`}
              >
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <AutocompleteInput
        label="Add an act"
        placeholder="Search or type an act name"
        suggestions={suggestions}
        exclude={draftActs}
        disabled={submitting}
        onSubmit={(name) => setDraftActs((current) => [...current, name])}
      />
    </EditorModalForm>
  );
}
