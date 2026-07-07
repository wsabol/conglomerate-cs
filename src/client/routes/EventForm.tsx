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

export default function EventForm({ mode }: { mode: "new" | "edit" }) {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(emptyForm);
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
  }, [eventData]);

  const placeOptions = useMemo(
    () =>
      places.map((p) => ({
        value: String(p.id),
        label: p.name,
      })),
    [places],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const body = {
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

    try {
      if (mode === "new") {
        const created = await createEvent(body);
        navigate(`/events/${created.slug}`);
      } else {
        const updated = await patchEvent(slug!, body);
        navigate(`/events/${updated.slug}`);
      }
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
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <Select
          label="Event type"
          value={form.eventType}
          onChange={(e) =>
            setForm({ ...form, eventType: e.target.value as EventType })
          }
          options={EVENT_TYPES.map((t) => ({
            value: t,
            label: t.charAt(0).toUpperCase() + t.slice(1),
          }))}
        />
        <TextField
          label="Date"
          type="date"
          value={form.eventDate}
          onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
        />
        <TextField
          label="Start time"
          type="time"
          value={form.eventTime}
          onChange={(e) => setForm({ ...form, eventTime: e.target.value })}
        />
        <Select
          label="Date precision"
          value={form.datePrecision}
          onChange={(e) =>
            setForm({
              ...form,
              datePrecision: e.target.value as DatePrecision,
            })
          }
          options={DATE_PRECISIONS.map((p) => ({ value: p, label: p }))}
        />
        <Select
          label="Place"
          value={form.placeId}
          onChange={(e) => setForm({ ...form, placeId: e.target.value })}
          placeholder="Select a place"
          options={[{ value: "", label: "None" }, ...placeOptions]}
        />
        <Select
          label="Confidence"
          value={form.confidence}
          onChange={(e) =>
            setForm({
              ...form,
              confidence: e.target.value as Confidence,
            })
          }
          options={CONFIDENCE_LEVELS.map((c) => ({ value: c, label: c }))}
        />
        <TextArea
          label="Summary"
          value={form.summary}
          onChange={(e) => setForm({ ...form, summary: e.target.value })}
          rows={6}
        />
        <TextField
          label="Billing name"
          value={form.billingName}
          onChange={(e) => setForm({ ...form, billingName: e.target.value })}
          hint="Shown as the performance title when set"
        />
        <TextArea
          label="Setlist"
          value={form.setlistText}
          onChange={(e) => setForm({ ...form, setlistText: e.target.value })}
          rows={4}
        />
        <TextArea
          label="Promotion text"
          value={form.promotionText}
          onChange={(e) => setForm({ ...form, promotionText: e.target.value })}
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
