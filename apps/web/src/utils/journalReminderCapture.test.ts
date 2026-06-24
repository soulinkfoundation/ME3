import { describe, expect, it } from "vitest";
import { parseJournalReminderCapture } from "./journalReminderCapture";

describe("parseJournalReminderCapture", () => {
  it("extracts weekday and time from selected reminder prose", () => {
    expect(
      parseJournalReminderCapture("test reminder saturday 9am", {
        today: "2026-06-24",
        fallbackDate: "2026-06-24",
        fallbackTime: "08:00",
      }),
    ).toEqual({
      title: "test reminder",
      date: "2026-06-27",
      time: "09:00",
    });
  });
});
