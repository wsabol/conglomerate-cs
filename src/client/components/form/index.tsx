import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "../../lib/cn";
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
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
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

interface FileInputProps {
  label?: string;
  accept?: string;
  multiple?: boolean;
  onFiles: (files: FileList) => void;
}

export function FileInput({
  label = "Choose files or drag them here",
  accept,
  multiple,
  onFiles,
}: FileInputProps) {
  return (
    <label
      className={styles.fileInput}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
    >
      <Icon name="upload" label="Upload" />
      <span>{label}</span>
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
        }}
      />
    </label>
  );
}
