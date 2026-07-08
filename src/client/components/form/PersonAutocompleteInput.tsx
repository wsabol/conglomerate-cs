import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import styles from "./AutocompleteInput.module.css";

export interface PersonSuggestion {
  id: number;
  displayName: string;
}

export type PersonAutocompleteSubmit =
  | { personId: number; displayName: string }
  | { displayName: string; isNew: true };

interface PersonAutocompleteInputProps {
  label: string;
  placeholder?: string;
  suggestions: PersonSuggestion[];
  disabled?: boolean;
  onSubmit: (result: PersonAutocompleteSubmit) => void;
}

function findExactMatch(
  suggestions: PersonSuggestion[],
  name: string,
): PersonSuggestion | undefined {
  const query = name.trim().toLowerCase();
  return suggestions.find(
    (person) => person.displayName.toLowerCase() === query,
  );
}

export function PersonAutocompleteInput({
  label,
  placeholder,
  suggestions,
  disabled,
  onSubmit,
}: PersonAutocompleteInputProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const filtered = useMemo(() => {
    const query = value.trim().toLowerCase();
    return suggestions
      .filter(
        (person) =>
          !query || person.displayName.toLowerCase().includes(query),
      )
      .slice(0, 8);
  }, [suggestions, value]);

  const listOpen = open && filtered.length > 0;

  useEffect(() => {
    setActiveIndex(-1);
  }, [value, filtered]);

  useEffect(() => {
    if (activeIndex >= 0) {
      optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  function add(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const match = findExactMatch(suggestions, trimmed);
    if (match) {
      onSubmit({ personId: match.id, displayName: match.displayName });
    } else {
      onSubmit({ displayName: trimmed, isNew: true });
    }
    setValue("");
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  function selectPerson(person: PersonSuggestion) {
    onSubmit({ personId: person.id, displayName: person.displayName });
    setValue("");
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  function selectActiveOrTyped() {
    if (activeIndex >= 0 && activeIndex < filtered.length) {
      selectPerson(filtered[activeIndex]);
      return;
    }
    add(value);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      if (listOpen) {
        e.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      if (filtered.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setActiveIndex((index) =>
        index < filtered.length - 1 ? index + 1 : 0,
      );
      return;
    }

    if (e.key === "ArrowUp") {
      if (filtered.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setActiveIndex((index) =>
        index <= 0 ? filtered.length - 1 : index - 1,
      );
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      selectActiveOrTyped();
    }
  }

  return (
    <div className={styles.wrap}>
      <label className={styles.label} htmlFor={listId}>
        {label}
      </label>
      <div className={styles.row}>
        <div className={styles.inputWrap}>
          <input
            ref={inputRef}
            id={listId}
            className={styles.input}
            type="text"
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="off"
            role="combobox"
            aria-expanded={listOpen}
            aria-controls={`${listId}-listbox`}
            aria-autocomplete="list"
            aria-activedescendant={
              listOpen && activeIndex >= 0
                ? `${listId}-option-${activeIndex}`
                : undefined
            }
            onChange={(e) => {
              setValue(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              window.setTimeout(() => {
                setOpen(false);
                setActiveIndex(-1);
              }, 120);
            }}
            onKeyDown={handleKeyDown}
          />
          {listOpen && (
            <ul
              id={`${listId}-listbox`}
              className={styles.listbox}
              role="listbox"
            >
              {filtered.map((person, index) => (
                <li key={person.id} role="presentation">
                  <button
                    ref={(el) => {
                      optionRefs.current[index] = el;
                    }}
                    id={`${listId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={activeIndex === index}
                    className={styles.option}
                    data-active={activeIndex === index || undefined}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectPerson(person)}
                  >
                    {person.displayName}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          className={styles.add}
          disabled={disabled || !value.trim()}
          onClick={() => add(value)}
          aria-label="Add person"
        >
          <Icon name="plus" size={16} />
        </button>
      </div>
    </div>
  );
}
