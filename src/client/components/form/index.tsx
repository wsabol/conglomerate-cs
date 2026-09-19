import {
  useEffect,
  useId,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "../../lib/cn";
import {
  fileMatchesAccept,
  filesFromClipboard,
  isEditablePasteTarget,
} from "../../lib/fileInput";
import { Icon } from "../ui/Icon";
import styles from "./form.module.css";

interface FieldProps {
  label: string;
  htmlFor: string;
  children: ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
}

export function Field({
  label,
  htmlFor,
  children,
  hint,
  error,
  required,
}: FieldProps) {
  const hintId = `${htmlFor}-hint`;
  const errorId = `${htmlFor}-error`;
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
        {required && (
          <span className={styles.required} aria-hidden="true">
            *
          </span>
        )}
      </label>
      {hint && (
        <span className={styles.hint} id={hintId}>
          {hint}
        </span>
      )}
      {children}
      {error && (
        <span className={styles.error} id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

interface TextFieldProps
  extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function TextField({
  label,
  hint,
  error,
  id,
  required,
  ...rest
}: TextFieldProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <Field label={label} htmlFor={fieldId} hint={hint} error={error} required={required}>
      <input
        id={fieldId}
        className={styles.control}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        required={required}
        {...rest}
      />
    </Field>
  );
}

interface TextAreaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function TextArea({
  label,
  hint,
  error,
  id,
  required,
  ...rest
}: TextAreaProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <Field label={label} htmlFor={fieldId} hint={hint} error={error} required={required}>
      <textarea
        id={fieldId}
        className={styles.control}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        required={required}
        {...rest}
      />
    </Field>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
}

interface SelectProps
  extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[];
  hint?: string;
  error?: string;
  placeholder?: string;
}

export function Select({
  label,
  options,
  hint,
  error,
  placeholder,
  id,
  required,
  ...rest
}: SelectProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  const ungroupedOptions = options.filter((option) => !option.group);
  const groupedOptions = new Map<string, SelectOption[]>();

  for (const option of options) {
    if (!option.group) continue;
    const group = groupedOptions.get(option.group) ?? [];
    group.push(option);
    groupedOptions.set(option.group, group);
  }

  return (
    <Field label={label} htmlFor={fieldId} hint={hint} error={error} required={required}>
      <div className={styles.selectWrap}>
        <select
          id={fieldId}
          className={cn(styles.control, styles.select)}
          aria-invalid={error ? true : undefined}
          required={required}
          {...rest}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {ungroupedOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          {[...groupedOptions].map(([group, groupOptions]) => (
            <optgroup key={group} label={group}>
              {groupOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <Icon name="chevron-down" size={18} />
      </div>
    </Field>
  );
}

export interface RadioOption {
  value: string;
  label: ReactNode;
}

interface RadioGroupProps {
  legend: string;
  name: string;
  options: RadioOption[];
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  compact?: boolean;
}

export function RadioGroup({
  legend,
  name,
  options,
  value,
  onChange,
  hint,
  error,
}: RadioGroupProps) {
  return (
    <fieldset className={styles.field} style={{ border: "none", padding: 0 }}>
      <legend className={styles.label}>{legend}</legend>
      {hint && <span className={styles.hint}>{hint}</span>}
      <div className={styles.radioGroup} role="radiogroup">
        {options.map((o) => {
          const checked = o.value === value;
          return (
            <label
              key={o.value}
              className={cn(styles.radio, checked && styles.radioChecked)}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={checked}
                onChange={() => onChange(o.value)}
              />
              <span className={styles.radioLabel}>{o.label}</span>
            </label>
          );
        })}
      </div>
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </fieldset>
  );
}

export { AutocompleteInput } from "./AutocompleteInput";
export { MentionTextArea } from "./MentionTextArea";
export { PersonAutocompleteInput } from "./PersonAutocompleteInput";
export type {
  PersonAutocompleteSubmit,
  PersonSuggestion,
} from "./PersonAutocompleteInput";

interface FileInputProps {
  label?: string;
  accept?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
}

export function FileInput({
  label = "Choose files, drag them here, or paste",
  accept,
  multiple,
  onFiles,
}: FileInputProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onFilesRef = useRef(onFiles);
  const acceptRef = useRef(accept);
  const multipleRef = useRef(multiple);
  onFilesRef.current = onFiles;
  acceptRef.current = accept;
  multipleRef.current = multiple;

  function emitFiles(list: Iterable<File>, filterAccept = false) {
    let files = Array.from(list);
    if (filterAccept) {
      files = files.filter((file) =>
        fileMatchesAccept(file, acceptRef.current),
      );
    }
    if (!files.length) return false;
    onFilesRef.current(multipleRef.current ? files : files.slice(0, 1));
    return true;
  }

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const root = rootRef.current;
      if (!root) return;
      if (isEditablePasteTarget(event.target)) return;

      const active = document.activeElement;
      const hovered = root.matches(":hover");
      const focused = Boolean(active && root.contains(active));
      if (!hovered && !focused) return;

      const files = filesFromClipboard(event.clipboardData);
      if (!files.length) return;
      if (emitFiles(files, true)) event.preventDefault();
    }

    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  return (
    <div
      ref={rootRef}
      className={styles.fileInput}
      tabIndex={0}
      role="button"
      aria-label={label}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        emitFiles(e.dataTransfer.files);
      }}
    >
      <Icon name="upload" />
      <span>{label}</span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        tabIndex={-1}
        onChange={(e) => {
          if (e.target.files?.length) emitFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
