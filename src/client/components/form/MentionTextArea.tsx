import {
  useEffect,
  useId,
  useRef,
  useState,
  type TextareaHTMLAttributes,
} from "react";
import { listPeople } from "../../lib/people";
import {
  getActiveMentionRange,
  insertMentionAtRange,
  populateMentionEditor,
  serializeMentionEditor,
} from "../../lib/mentionEditor";
import { filterPeopleForMention, type MentionPerson } from "@shared/mentions";
import formStyles from "./form.module.css";
import styles from "./MentionTextArea.module.css";

interface MentionTextAreaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> {
  label: string;
  hint?: string;
  error?: string;
  value: string;
  onChange: (value: string) => void;
}

export function MentionTextArea({
  label,
  hint,
  error,
  value,
  onChange,
  id,
  required,
  placeholder,
  rows = 4,
}: MentionTextAreaProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  const listId = `${fieldId}-mentions`;
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string | undefined>(undefined);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [people, setPeople] = useState<MentionPerson[]>([]);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionRange, setMentionRange] = useState<Range | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    let cancelled = false;
    listPeople()
      .then((result) => {
        if (!cancelled) {
          setPeople(
            result.results.map((person) => ({
              id: person.id,
              displayName: person.displayName,
              aliases: person.aliases,
            })),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setPeople([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (value === lastEmitted.current) return;
    populateMentionEditor(editor, value, styles.mentionChip);
    lastEmitted.current = value;
  }, [value]);

  const filtered = filterPeopleForMention(mentionQuery, people);
  const listOpen = open && mentionRange !== null && filtered.length > 0;

  useEffect(() => {
    setActiveIndex(-1);
  }, [mentionQuery, filtered.length]);

  useEffect(() => {
    if (activeIndex >= 0) {
      optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  function emitChange() {
    const editor = editorRef.current;
    if (!editor) return;
    const serialized = serializeMentionEditor(editor);
    lastEmitted.current = serialized;
    onChange(serialized);
  }

  function syncMentionState() {
    const editor = editorRef.current;
    if (!editor) return;
    const active = getActiveMentionRange(editor);
    if (active) {
      setMentionRange(active.range);
      setMentionQuery(active.query);
      setOpen(true);
      return;
    }
    setMentionRange(null);
    setMentionQuery("");
    setOpen(false);
    setActiveIndex(-1);
  }

  function insertMention(person: MentionPerson) {
    const editor = editorRef.current;
    if (!editor) return;
    const active = getActiveMentionRange(editor);
    if (!active) return;
    insertMentionAtRange(active.range, person, styles.mentionChip);
    emitChange();
    setMentionRange(null);
    setMentionQuery("");
    setOpen(false);
    setActiveIndex(-1);
    editor.focus();
  }

  function handleInput() {
    emitChange();
    syncMentionState();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (listOpen) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((index) =>
          index < filtered.length - 1 ? index + 1 : 0,
        );
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((index) =>
          index <= 0 ? filtered.length - 1 : index - 1,
        );
        return;
      }

      if (e.key === "Enter" || e.key === "Tab") {
        if (activeIndex >= 0 && activeIndex < filtered.length) {
          e.preventDefault();
          insertMention(filtered[activeIndex]);
          return;
        }
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      document.execCommand("insertLineBreak");
      emitChange();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    emitChange();
    syncMentionState();
  }

  const minHeight = `${Math.max(rows, 2) * 1.5}rem`;

  return (
    <div className={styles.wrap}>
      <div className={formStyles.field}>
        <label className={formStyles.label} htmlFor={fieldId}>
          {label}
          {required && (
            <span className={formStyles.required} aria-hidden="true">
              *
            </span>
          )}
        </label>
        {hint && (
          <span className={formStyles.hint} id={`${fieldId}-hint`}>
            {hint}
          </span>
        )}
        <div className={styles.inputWrap}>
          <div
            ref={editorRef}
            id={fieldId}
            role="textbox"
            contentEditable
            suppressContentEditableWarning
            className={styles.editor}
            style={{ minHeight }}
            data-placeholder={placeholder}
            aria-invalid={error ? true : undefined}
            aria-describedby={
              error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined
            }
            aria-expanded={listOpen}
            aria-controls={listOpen ? listId : undefined}
            aria-autocomplete={listOpen ? "list" : undefined}
            aria-activedescendant={
              listOpen && activeIndex >= 0
                ? `${listId}-option-${activeIndex}`
                : undefined
            }
            aria-multiline="true"
            onInput={handleInput}
            onClick={syncMentionState}
            onKeyUp={syncMentionState}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={() => {
              window.setTimeout(() => {
                setOpen(false);
                setActiveIndex(-1);
              }, 120);
            }}
          />
          {listOpen && (
            <ul id={listId} className={styles.listbox} role="listbox">
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
                    onClick={() => insertMention(person)}
                  >
                    {person.displayName}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {error && (
          <span className={formStyles.error} id={`${fieldId}-error`} role="alert">
            {error}
          </span>
        )}
      </div>

      <p className={styles.mentionHint}>Type @ to mention someone.</p>
    </div>
  );
}
