import {
  formatMention,
  parseMentionSegments,
  type MentionPerson,
} from "@shared/mentions";

const MENTION_ID_ATTR = "data-mention-id";
const MENTION_NAME_ATTR = "data-display-name";

export function createMentionChip(
  displayName: string,
  personId: number,
  className: string,
): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.className = className;
  chip.contentEditable = "false";
  chip.setAttribute(MENTION_ID_ATTR, String(personId));
  chip.setAttribute(MENTION_NAME_ATTR, displayName);
  chip.textContent = `@${displayName}`;
  return chip;
}

export function serializeMentionEditor(root: HTMLElement): string {
  let result = "";
  for (const node of root.childNodes) {
    result += serializeMentionNode(node);
  }
  return result;
}

function serializeMentionNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as HTMLElement;
  const personId = el.getAttribute(MENTION_ID_ATTR);
  const displayName = el.getAttribute(MENTION_NAME_ATTR);
  if (personId && displayName) {
    return formatMention(displayName, Number(personId));
  }

  if (el.tagName === "BR") return "\n";

  let result = "";
  for (const child of el.childNodes) {
    result += serializeMentionNode(child);
  }
  return result;
}

export function populateMentionEditor(
  root: HTMLElement,
  body: string,
  chipClassName: string,
): void {
  root.replaceChildren();
  for (const segment of parseMentionSegments(body)) {
    if (segment.type === "text") {
      root.appendChild(document.createTextNode(segment.text));
      continue;
    }
    root.appendChild(
      createMentionChip(segment.displayName, segment.personId, chipClassName),
    );
  }
}

export interface ActiveMentionRange {
  query: string;
  range: Range;
}

/** Active `@query` typed in a text node immediately before the caret. */
export function getActiveMentionRange(
  editor: HTMLElement,
): ActiveMentionRange | null {
  const selection = window.getSelection();
  if (!selection || !selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  const caret = selection.getRangeAt(0);
  if (!editor.contains(caret.startContainer)) return null;
  if (caret.startContainer.nodeType !== Node.TEXT_NODE) return null;

  const textNode = caret.startContainer as Text;
  const before = textNode.data.slice(0, caret.startOffset);
  const match = before.match(/@([^@\n]*)$/);
  if (!match) return null;

  const queryRange = document.createRange();
  queryRange.setStart(textNode, caret.startOffset - match[0].length);
  queryRange.setEnd(textNode, caret.startOffset);

  return { query: match[1], range: queryRange };
}

export function insertMentionAtRange(
  range: Range,
  person: MentionPerson,
  chipClassName: string,
): void {
  range.deleteContents();
  const chip = createMentionChip(person.displayName, person.id, chipClassName);
  range.insertNode(chip);

  const space = document.createTextNode(" ");
  chip.after(space);

  const selection = window.getSelection();
  if (!selection) return;
  const after = document.createRange();
  after.setStart(space, space.data.length);
  after.collapse(true);
  selection.removeAllRanges();
  selection.addRange(after);
}
