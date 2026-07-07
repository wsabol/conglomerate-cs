import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Container } from "../components/layout";
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/Button";
import { TextField, TextArea, Select } from "../components/form";
import { ErrorState, Spinner } from "../components/state";
import { useAsync } from "../lib/useAsync";
import { createEvent, getEvent, patchEvent } from "../lib/events";
import { useFilterOptions } from "../lib/useFilterOptions";
import { zodFieldErrors } from "../lib/zodErrors";
import {
  eventCreateSchema,
  eventUpdateSchema,
} from "@shared/schemas/event";
import {
  CONFIDENCE_LEVELS,
  DATE_PRECISIONS,
  EVENT_TYPES,
  type Confidence,
  type DatePrecision,
  type EventType,
} from "@shared/types";
import styles from "./EventForm.module.css";

type FormState = {
  name: string;
  eventType: EventType;
  eventDate: string;
  eventTime: string;
  datePrecision: DatePrecision;
  placeId: string;
  summary: string;
  confidence: Confidence;
  billingName: string;
  setlistText: string;
  promotionText: string;
};

type FormField = keyof FormState;

const ZOD_PATHS: Record<FormField, string> = {
  name: "name",
  eventType: "eventType",
  eventDate: "eventDate",
  eventTime: "eventTime",
  datePrecision: "datePrecision",
  placeId: "placeId",
  summary: "summary",
  confidence: "confidence",
  billingName: "performance.billingName",
  setlistText: "performance.setlistText",
  promotionText: "performance.promotionText",
};

const emptyForm: FormState = {
  name: "",
  eventType: "performance",
  eventDate: "",
  eventTime: "",
  datePrecision: "exact",
  placeId: "",
  summary: "",
  confidence: "medium",
  billingName: "",
  setlistText: "",
  promotionText: "",
};

function buildEventBody(form: FormState) {
  return {
    name: form.name,
    eventType: form.eventType,
    eventDate: form.eventDate || null,
    eventTime: form.eventTime || null,
    datePrecision: form.datePrecision,
    placeId: form.placeId ? Number(form.placeId) : null,
    summary: form.summary || null,
    confidence: form.confidence,
    performance: {
      billingName: form.billingName || null,
      setlistText: form.setlistText || null,
      promotionText: form.promotionText || null,
    },
  };
}

function mapZodErrorsToForm(
  zodErrors: Record<string, string>,
): Partial<Record<FormField, string>> {
  const mapped: Partial<Record<FormField, string>> = {};
  for (const [field, path] of Object.entries(ZOD_PATHS) as [FormField, string][]) {
    if (zodErrors[path]) mapped[field] = zodErrors[path];
  }
  return mapped;
}

export default function EventForm({ mode }: { mode: "new" | "edit" }) {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<FormField, string>>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { places } = useFilterOptions({ places: true });

  const { data: eventData, loading: eventLoading } = useAsync(
    () =>
      mode === "edit" && slug
        ? getEvent(slug)
        : Promise.resolve(null),
    [mode, slug],
  );

  useEffect(() => {
    if (!eventData) return;
    setForm({
      name: eventData.name,
      eventType: eventData.eventType,
      eventDate: eventData.eventDate ?? "",
      eventTime: eventData.eventTime ?? "",
      datePrecision: eventData.datePrecision,
      placeId: eventData.place?.id ? String(eventData.place.id) : "",
      summary: eventData.summary ?? "",
      confidence: eventData.confidence,
      billingName: eventData.performance?.billingName ?? "",
      setlistText: eventData.performance?.setlistText ?? "",
      promotionText: eventData.performance?.promotionText ?? "",
    });
    setFieldErrors({});
  }, [eventData]);

  const placeOptions = useMemo(
    () =>
      places.map((p) => ({
        value: String(p.id),
        label: p.name,
      })),
    [places],
  );

  function updateField<K extends FormField>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const body = buildEventBody(form);

    if (mode === "new") {
      const parsed = eventCreateSchema.safeParse(body);
      if (!parsed.success) {
        setFieldErrors(mapZodErrorsToForm(zodFieldErrors(parsed.error)));
        setError("Fix the highlighted fields and try again.");
        setSubmitting(false);
        return;
      }

      setFieldErrors({});

      try {
        const created = await createEvent(parsed.data);
        navigate(`/events/${created.slug}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save event.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const parsed = eventUpdateSchema.safeParse(body);
    if (!parsed.success) {
      setFieldErrors(mapZodErrorsToForm(zodFieldErrors(parsed.error)));
      setError("Fix the highlighted fields and try again.");
      setSubmitting(false);
      return;
    }

    setFieldErrors({});

    try {
      const updated = await patchEvent(slug!, parsed.data);
      navigate(`/events/${updated.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save event.");
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === "edit" && eventLoading) {
    return (
      <Container width="narrow">
        <Spinner label="Loading event" />
      </Container>
    );
  }

  return (
    <Container width="narrow">
      <PageHeader
        eyebrow="Editors only"
        title={mode === "new" ? "New event" : "Edit event"}
      />

      <form className={styles.form} onSubmit={handleSubmit}>
        <TextField
          label="Name"
          value={form.name}
          onChange={(e) => updateField("name", e.target.value)}
          error={fieldErrors.name}
          required
        />
        <Select
          label="Event type"
          value={form.eventType}
          onChange={(e) =>
            updateField("eventType", e.target.value as EventType)
          }
          error={fieldErrors.eventType}
          options={EVENT_TYPES.map((t) => ({
            value: t,
            label: t.charAt(0).toUpperCase() + t.slice(1),
          }))}
        />
        <TextField
          label="Date"
          type="date"
          value={form.eventDate}
          onChange={(e) => updateField("eventDate", e.target.value)}
          error={fieldErrors.eventDate}
        />
        <TextField
          label="Start time"
          type="time"
          value={form.eventTime}
          onChange={(e) => updateField("eventTime", e.target.value)}
          error={fieldErrors.eventTime}
        />
        <Select
          label="Date precision"
          value={form.datePrecision}
          onChange={(e) =>
            updateField("datePrecision", e.target.value as DatePrecision)
          }
          error={fieldErrors.datePrecision}
          options={DATE_PRECISIONS.map((p) => ({ value: p, label: p }))}
        />
        <Select
          label="Place"
          value={form.placeId}
          onChange={(e) => updateField("placeId", e.target.value)}
          error={fieldErrors.placeId}
          placeholder="Select a place"
          options={[{ value: "", label: "None" }, ...placeOptions]}
        />
        <Select
          label="Confidence"
          value={form.confidence}
          onChange={(e) =>
            updateField("confidence", e.target.value as Confidence)
          }
          error={fieldErrors.confidence}
          options={CONFIDENCE_LEVELS.map((c) => ({ value: c, label: c }))}
        />
        <TextArea
          label="Summary"
          value={form.summary}
          onChange={(e) => updateField("summary", e.target.value)}
          error={fieldErrors.summary}
          rows={6}
        />
        <TextField
          label="Billing name"
          value={form.billingName}
          onChange={(e) => updateField("billingName", e.target.value)}
          error={fieldErrors.billingName}
          hint="Shown as the performance title when set"
        />
        <TextArea
          label="Setlist"
          value={form.setlistText}
          onChange={(e) => updateField("setlistText", e.target.value)}
          error={fieldErrors.setlistText}
          rows={4}
        />
        <TextArea
          label="Promotion text"
          value={form.promotionText}
          onChange={(e) => updateField("promotionText", e.target.value)}
          error={fieldErrors.promotionText}
          rows={3}
        />

        {error && (
          <ErrorState title="Save failed" message={error} />
        )}

        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? "Saving…" : mode === "new" ? "Create event" : "Save changes"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate(-1)}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Container>
  );
}
