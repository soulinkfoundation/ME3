import { describe, expect, it } from "vitest";
import { calendarEventEndOneHourAfter } from "./calendarEventForm";

describe("calendarEventEndOneHourAfter", () => {
  it("keeps the end date aligned and adds one hour", () => {
    expect(calendarEventEndOneHourAfter("2026-07-16", "14:30")).toEqual({
      endDate: "2026-07-16",
      endTime: "15:30",
    });
  });

  it("preserves a real hour when the start crosses midnight", () => {
    expect(calendarEventEndOneHourAfter("2026-07-16", "23:30")).toEqual({
      endDate: "2026-07-17",
      endTime: "00:30",
    });
  });

  it("ignores incomplete or invalid form values", () => {
    expect(calendarEventEndOneHourAfter("", "14:30")).toBeNull();
    expect(calendarEventEndOneHourAfter("2026-02-31", "14:30")).toBeNull();
    expect(calendarEventEndOneHourAfter("2026-07-16", "25:00")).toBeNull();
  });
});
