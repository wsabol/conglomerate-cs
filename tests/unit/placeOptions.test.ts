import { describe, expect, it } from "vitest";
import { placeSelectOptions } from "../../src/client/lib/places";
import type { PlaceDTO } from "../../src/shared/dto";

function place(
  id: number,
  name: string,
  placeType: string | null,
): PlaceDTO {
  return {
    id,
    name,
    placeType,
    address: null,
    status: "unknown",
  };
}

describe("placeSelectOptions", () => {
  it("groups places by a display label for their place type", () => {
    expect(
      placeSelectOptions([
        place(1, "Home", "residence"),
        place(2, "The Pub", "bar"),
      ]),
    ).toEqual([
      { value: "2", label: "The Pub", group: "Bar" },
      { value: "1", label: "Home", group: "Residence" },
    ]);
  });

  it("puts blank and null place types in Other", () => {
    expect(
      placeSelectOptions([
        place(1, "Unknown A", null),
        place(2, "Unknown B", ""),
        place(3, "Known", "venue"),
      ]),
    ).toEqual([
      { value: "3", label: "Known", group: "Venue" },
      { value: "1", label: "Unknown A", group: "Other" },
      { value: "2", label: "Unknown B", group: "Other" },
    ]);
  });
});
