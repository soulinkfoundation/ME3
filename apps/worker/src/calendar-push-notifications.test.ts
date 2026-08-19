import { describe, expect, it } from "vitest";
import {
  eventLikeCandidate,
  taskCandidate,
} from "./calendar-push-notifications";

describe("calendar push notification timing", () => {
  it("alerts timed events fifteen minutes before they start", () => {
    expect(eventLikeCandidate(
      "owner",
      "events",
      "event-1",
      "2026-08-19T10:30:00.000Z",
      false,
      "Europe/Dublin",
      "Europe/Dublin",
    )).toEqual({
      userId: "owner",
      category: "events",
      itemId: "event-1",
      occurrenceId: "2026-08-19T10:30:00.000Z",
      alertOffsetMinutes: 15,
      alertAt: "2026-08-19T10:15:00.000Z",
    });
  });

  it("alerts all-day calendar items at nine in the owner's timezone", () => {
    expect(eventLikeCandidate(
      "owner",
      "birthdays",
      "birthday-1",
      "2026-08-18T23:00:00.000Z",
      true,
      "Europe/Dublin",
      "UTC",
    ).alertAt).toBe("2026-08-19T08:00:00.000Z");
  });

  it("alerts date-only tasks at nine and timed tasks at their due time", () => {
    expect(taskCandidate("owner", "task-1", "2026-08-19", "Europe/Dublin").alertAt)
      .toBe("2026-08-19T08:00:00.000Z");
    expect(taskCandidate(
      "owner",
      "task-2",
      "2026-08-19T12:45:00.000Z",
      "Europe/Dublin",
    ).alertAt).toBe("2026-08-19T12:45:00.000Z");
  });
});
