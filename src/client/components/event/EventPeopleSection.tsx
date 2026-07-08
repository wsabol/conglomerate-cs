import { useEffect, useMemo, useState } from "react";
import {
  PersonAutocompleteInput,
  type PersonAutocompleteSubmit,
} from "../form";
import { Icon } from "../ui/Icon";
import type { IconName } from "../ui/Icon";
import { patchEvent } from "../../lib/events";
import {
  relationshipTypeLabel,
  sortPeopleForDisplay,
} from "../../lib/format";
import { createPerson, listPeople } from "../../lib/people";
import { useAsync } from "../../lib/useAsync";
import type { EventDetailDTO } from "@shared/dto";
import type { RelationshipType } from "@shared/types";
import { EditableSidebarSection } from "./EditableSidebarSection";
import { EditorModalForm } from "./EditorModalForm";
import { useEditorModal } from "./useEditorModal";
import eventStyles from "./event.module.css";
import styles from "../form/modal.module.css";
import { Tag } from "../ui/Pill";

interface EventPeopleSectionProps {
  event: EventDetailDTO;
  isEditor: boolean;
  onReload: () => void;
}

interface DraftPerson {
  key: string;
  personId?: number;
  displayName: string;
  relationshipType: RelationshipType;
  isNew: boolean;
}

const RELATIONSHIP_ROLE_OPTIONS: {
  value: RelationshipType;
  label: string;
}[] = [
  { value: "performer", label: "Performer" },
  { value: "attendee", label: "Attendee" },
  { value: "organizer", label: "Organizer" },
  { value: "photographer", label: "Photographer" },
  { value: "unknown", label: "Unknown" },
];

const RELATIONSHIP_TYPE_ICONS: Record<
  Exclude<RelationshipType, "performer">,
  IconName
> = {
  attendee: "people",
  organizer: "mic",
  photographer: "photo",
  unknown: "help",
};

function relationshipTypeIcon(type: RelationshipType): IconName | null {
  if (type === "performer") return null;
  return RELATIONSHIP_TYPE_ICONS[type];
}

function draftKey(person: {
  personId?: number;
  displayName: string;
  relationshipType: RelationshipType;
}): string {
  const identity = person.personId ?? `new:${person.displayName.trim().toLowerCase()}`;
  return `${identity}:${person.relationshipType}`;
}

function comboKey(person: {
  personId?: number;
  displayName: string;
  relationshipType: RelationshipType;
}): string {
  const identity = person.personId ?? `new:${person.displayName.trim().toLowerCase()}`;
  return `${identity}:${person.relationshipType}`;
}

function hasDuplicateCombo(
  draft: DraftPerson[],
  candidate: {
    personId?: number;
    displayName: string;
    relationshipType: RelationshipType;
  },
  excludeKey?: string,
): boolean {
  const key = comboKey(candidate);
  return draft.some(
    (person) => person.key !== excludeKey && comboKey(person) === key,
  );
}

export function EventPeopleSection({
  event,
  isEditor,
  onReload,
}: EventPeopleSectionProps) {
  const sortedPeople = useMemo(
    () => sortPeopleForDisplay(event.people),
    [event.people],
  );

  return (
    <EditableSidebarSection
      title="Personnel"
      items={sortedPeople}
      isEditor={isEditor}
      emptyMessage="No personnel listed yet."
      addLabel="Add personnel"
      editLabel="Edit personnel"
      getItemKey={(person) => `${person.personId}:${person.relationshipType}`}
      renderItem={(person) => {
        const showRole = person.relationshipType !== "performer";
        const roleLabel = relationshipTypeLabel(person.relationshipType);
        const roleIcon = relationshipTypeIcon(person.relationshipType);
        return (
          <span className={eventStyles.actRow}>
            <span>{person.displayName}</span>
            {showRole && roleIcon && (
              <Tag icon={roleIcon} iconLabel={roleLabel}>
                {roleLabel}
              </Tag>
            )}
          </span>
        );
      }}
      onReload={onReload}
      renderModal={(modalProps) => (
        <EventPeopleModal event={event} {...modalProps} />
      )}
    />
  );
}

function EventPeopleModal({
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
  const [draftPeople, setDraftPeople] = useState<DraftPerson[]>([]);
  const { submitting, error, save } = useEditorModal(open);

  const { data: peopleData } = useAsync(
    () => (open ? listPeople() : Promise.resolve(null)),
    [open],
  );

  const suggestions = useMemo(
    () =>
      (peopleData?.results ?? []).map((person) => ({
        id: person.id,
        displayName: person.displayName,
      })),
    [peopleData],
  );

  useEffect(() => {
    if (!open) return;
    setDraftPeople(
      event.people.map((person) => ({
        key: draftKey(person),
        personId: person.personId,
        displayName: person.displayName,
        relationshipType: person.relationshipType,
        isNew: false,
      })),
    );
  }, [open, event.people]);

  function addPerson(result: PersonAutocompleteSubmit) {
    const relationshipType: RelationshipType = "performer";
    const candidate =
      "isNew" in result
        ? {
            displayName: result.displayName,
            relationshipType,
            isNew: true as const,
          }
        : {
            personId: result.personId,
            displayName: result.displayName,
            relationshipType,
            isNew: false as const,
          };

    if (hasDuplicateCombo(draftPeople, candidate)) return;

    setDraftPeople((current) => [
      ...current,
      {
        key: draftKey(candidate),
        ...candidate,
      },
    ]);
  }

  function updateRole(key: string, relationshipType: RelationshipType) {
    setDraftPeople((current) => {
      const person = current.find((entry) => entry.key === key);
      if (!person) return current;
      const updated = { ...person, relationshipType };
      if (hasDuplicateCombo(current, updated, key)) return current;
      return current.map((entry) =>
        entry.key === key
          ? { ...entry, relationshipType, key: draftKey(updated) }
          : entry,
      );
    });
  }

  async function handleSubmit() {
    const ok = await save(async () => {
      const seen = new Set<string>();
      for (const person of draftPeople) {
        const key = comboKey(person);
        if (seen.has(key)) {
          throw new Error("Each person can only appear once per role.");
        }
        seen.add(key);
      }

      const resolved = [];
      for (const person of draftPeople) {
        let personId = person.personId;
        if (person.isNew || personId === undefined) {
          const created = await createPerson({ displayName: person.displayName });
          personId = created.id;
        }
        resolved.push({
          personId,
          relationshipType: person.relationshipType,
        });
      }
      await patchEvent(event.slug, { people: resolved });
    }, "Could not save personnel.");
    if (ok) onSaved();
  }

  return (
    <EditorModalForm
      open={open}
      onClose={onClose}
      title="Personnel"
      submitLabel="Save personnel"
      submitting={submitting}
      error={error}
      onSubmit={handleSubmit}
    >
      {draftPeople.length > 0 && (
        <ul className={styles.modalList}>
          {draftPeople.map((person) => (
            <li key={person.key}>
              <span className={`${styles.modalListAct} ${eventStyles.actRow}`}>
                <span>{person.displayName}</span>
                {person.isNew && (
                  <Tag iconLabel="New person">New</Tag>
                )}
              </span>
              <select
                className={styles.modalRoleSelect}
                value={person.relationshipType}
                onChange={(e) =>
                  updateRole(person.key, e.target.value as RelationshipType)
                }
                disabled={submitting}
                aria-label={`Relationship for ${person.displayName}`}
              >
                {RELATIONSHIP_ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.modalRemove}
                onClick={() =>
                  setDraftPeople((current) =>
                    current.filter((entry) => entry.key !== person.key),
                  )
                }
                aria-label={`Remove ${person.displayName}`}
              >
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <PersonAutocompleteInput
        label="Add a person"
        placeholder="Search or type a name"
        suggestions={suggestions}
        disabled={submitting}
        onSubmit={addPerson}
      />
    </EditorModalForm>
  );
}
