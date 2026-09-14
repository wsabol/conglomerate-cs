import { describe, expect, it } from "vitest";
import { personSelectOptions } from "../../src/client/lib/people";
import type { PersonDTO } from "../../src/shared/dto";

function person(
  id: number,
  displayName: string,
  personType: string | null,
): PersonDTO {
  return {
    id,
    displayName,
    personType,
    aliases: null,
    bio: null,
  };
}

describe("personSelectOptions", () => {
  it("groups people by a display label for their person type", () => {
    expect(
      personSelectOptions([
        person(1, "Alex", "friend"),
        person(2, "Casey", "band member"),
      ]),
    ).toEqual([
      { value: "2", label: "Casey", group: "Band member" },
      { value: "1", label: "Alex", group: "Friend" },
    ]);
  });

  it("puts blank and null person types in Other", () => {
    expect(
      personSelectOptions([
        person(1, "Unknown A", null),
        person(2, "Unknown B", ""),
        person(3, "Known", "musician"),
      ]),
    ).toEqual([
      { value: "3", label: "Known", group: "Musician" },
      { value: "1", label: "Unknown A", group: "Other" },
      { value: "2", label: "Unknown B", group: "Other" },
    ]);
  });
});
