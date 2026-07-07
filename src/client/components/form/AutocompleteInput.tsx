import { useId, useMemo, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import styles from "./AutocompleteInput.module.css";

interface AutocompleteInputProps {
  label: string;
  placeholder?: string;
  suggestions: string[];
  exclude?: string[];
  disabled?: boolean;
  onSubmit: (value: string) => void;
}

export function AutocompleteInput({
  label,
  placeholder,
  suggestions,
  exclude = [],
  disabled,
  onSubmit,
}: AutocompleteInputProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);

  const excluded = useMemo(
    () => new Set(exclude.map((name) => name.toLowerCase())),
    [exclude],
  );

  const filtered = useMemo(() => {
    const query = value.trim().toLowerCase();
    return suggestions
      .filter((name) => !excluded.has(name.toLowerCase()))
      .filter((name) => !query || name.toLowerCase().includes(query))
      .slice(0, 8);
  }, [suggestions, excluded, value]);

  function add(name: string) {
    const trimmed = name.trim();
    if (!trimmed || excluded.has(trimmed.toLowerCase())) return;
    onSubmit(trimmed);
    setValue("");
    setOpen(false);
    inputRef.current?.focus();
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
            aria-expanded={open && filtered.length > 0}
            aria-controls={`${listId}-listbox`}
            aria-autocomplete="list"
            onChange={(e) => {
              setValue(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              window.setTimeout(() => setOpen(false), 120);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(value);
              }
            }}
          />
          {open && filtered.length > 0 && (
            <ul
              id={`${listId}-listbox`}
              className={styles.listbox}
              role="listbox"
            >
              {filtered.map((name) => (
                <li key={name} role="option">
                  <button
                    type="button"
                    className={styles.option}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => add(name)}
                  >
                    {name}
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
          aria-label="Add act"
        >
          <Icon name="plus" size={16} />
        </button>
      </div>
    </div>
  );
}
