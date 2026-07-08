/** Canonical mention token: `@[Display Name](personId)` */
export const MENTION_TOKEN_PATTERN = /@\[([^\]]+)\]\((\d+)\)/g;

export function formatMention(displayName: string, personId: number): string {
  return `@[${displayName}](${personId})`;
}

export function extractPeopleIds(body: string): number[] {
  const ids = new Set<number>();
  for (const match of body.matchAll(MENTION_TOKEN_PATTERN)) {
    const id = Number(match[2]);
    if (Number.isInteger(id) && id > 0) ids.add(id);
  }
  return [...ids];
}

export type MentionSegment =
  | { type: "text"; text: string }
  | { type: "mention"; text: string; displayName: string; personId: number };

export function parseMentionSegments(body: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  const re = new RegExp(MENTION_TOKEN_PATTERN.source, "g");
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(body)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", text: body.slice(lastIndex, match.index) });
    }
    segments.push({
      type: "mention",
      text: match[0],
      displayName: match[1],
      personId: Number(match[2]),
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < body.length) {
    segments.push({ type: "text", text: body.slice(lastIndex) });
  }

  return segments;
}

export function parsePersonAliases(aliases: string | null): string[] {
  if (!aliases) return [];
  return aliases
    .split(",")
    .map((alias) => alias.trim())
    .filter(Boolean);
}

export interface MentionPerson {
  id: number;
  displayName: string;
  aliases: string | null;
}

export function filterPeopleForMention(
  query: string,
  people: MentionPerson[],
  limit = 8,
): MentionPerson[] {
  const normalized = query.trim().toLowerCase();
  return people
    .filter((person) => {
      if (!normalized) return true;
      const names = [person.displayName, ...parsePersonAliases(person.aliases)];
      return names.some((name) => name.toLowerCase().includes(normalized));
    })
    .slice(0, limit);
}

/** Active `@query` immediately before the cursor, if any. */
export function getActiveMentionQuery(
  text: string,
  cursor: number,
): { query: string; start: number } | null {
  const before = text.slice(0, cursor);
  const match = before.match(/@([^@\n]*)$/);
  if (!match) return null;
  return {
    query: match[1],
    start: cursor - match[0].length,
  };
}
