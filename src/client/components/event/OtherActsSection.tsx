import { useEffect, useMemo, useState } from "react";
import { AutocompleteInput } from "../form";
import { Icon } from "../ui/Icon";
import { apiFetch } from "../../lib/api";
import { patchEvent } from "../../lib/events";
import { sortActsForDisplay } from "../../lib/format";
import { useAsync } from "../../lib/useAsync";
import type { EventDetailDTO } from "@shared/dto";
import type { BillingRole, ListResult } from "@shared/types";
import { EditableSidebarSection } from "./EditableSidebarSection";
import { EditorModalForm } from "./EditorModalForm";
import { useEditorModal } from "./useEditorModal";
import eventStyles from "./event.module.css";
import styles from "../form/modal.module.css";
import { Tag } from "../ui/Pill";

interface OtherActsSectionProps {
  event: EventDetailDTO;
  isEditor: boolean;
  onReload: () => void;
}

interface DraftAct {
  name: string;
  billingRole: BillingRole;
}

const BILLING_ROLE_OPTIONS: { value: BillingRole; label: string }[] = [
  { value: "headliner", label: "Headliner" },
  { value: "opener", label: "Opener" },
  { value: "unknown", label: "Unknown" },
];

export function OtherActsSection({
  event,
  isEditor,
  onReload,
}: OtherActsSectionProps) {
  const sortedActs = useMemo(
    () => sortActsForDisplay(event.acts),
    [event.acts],
  );

  return (
    <EditableSidebarSection
      title="Acts on the bill"
      items={sortedActs}
      isEditor={isEditor}
      emptyMessage="No acts listed yet."
      addLabel="Add acts"
      editLabel="Edit acts"
      getItemKey={(act) => act.id}
      renderItem={(act) => {
        const isHeadliner = act.billingRole === "headliner";
        return (
          <span className={eventStyles.actRow}>
            <span>{act.name}</span>
            {isHeadliner && <Tag icon="star" iconLabel="Headliner">Headliner</Tag>}
          </span>
        );
      }}
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
  const [draftActs, setDraftActs] = useState<DraftAct[]>([]);
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

  const draftNames = useMemo(
    () => draftActs.map((act) => act.name),
    [draftActs],
  );

  useEffect(() => {
    if (!open) return;
    setDraftActs(
      event.acts.map((act) => ({
        name: act.name,
        billingRole: act.billingRole,
      })),
    );
  }, [open, event.acts]);

  function updateRole(name: string, billingRole: BillingRole) {
    setDraftActs((current) =>
      current.map((act) =>
        act.name === name ? { ...act, billingRole } : act,
      ),
    );
  }

  async function handleSubmit() {
    const ok = await save(async () => {
      await patchEvent(event.slug, { acts: draftActs });
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
          {draftActs.map((act) => (
            <li key={act.name}>
              <span className={styles.modalListAct}>{act.name}</span>
              <select
                className={styles.modalRoleSelect}
                value={act.billingRole}
                onChange={(e) =>
                  updateRole(act.name, e.target.value as BillingRole)
                }
                disabled={submitting}
                aria-label={`Billing role for ${act.name}`}
              >
                {BILLING_ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.modalRemove}
                onClick={() =>
                  setDraftActs((current) =>
                    current.filter((entry) => entry.name !== act.name),
                  )
                }
                aria-label={`Remove ${act.name}`}
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
        exclude={draftNames}
        disabled={submitting}
        onSubmit={(name) =>
          setDraftActs((current) => [
            ...current,
            { name, billingRole: "unknown" },
          ])
        }
      />
    </EditorModalForm>
  );
}
