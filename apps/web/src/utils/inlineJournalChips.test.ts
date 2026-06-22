import { describe, expect, it } from "vitest";
import { findInlineTextMatch } from "./inlineJournalChips";

describe("findInlineTextMatch", () => {
  it("finds text when editor whitespace differs from the source", () => {
    expect(
      findInlineTextMatch(
        "update site for bookings done on soulink for certain people, setting people up on me3",
        "update site for bookings done on soulink for certain people,\nsetting people up on me3",
      ),
    ).toEqual({ start: 0, end: 85 });
  });

  it("returns null when the source is not in the text", () => {
    expect(findInlineTextMatch("Some other note", "Create task")).toBeNull();
  });
});
