/** Convert arbitrary text into a URL-safe slug. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Build an event slug from a title and optional ISO date, e.g. "the-syndicate-2010-07-02". */
export function eventSlug(title: string, dateISO?: string | null): string {
  const base = slugify(title) || "event";
  const datePart = dateISO ? dateISO.slice(0, 10) : "";
  return datePart ? `${base}-${datePart}` : base;
}
