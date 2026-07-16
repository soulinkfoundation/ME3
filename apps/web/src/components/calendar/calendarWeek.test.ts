import { describe, expect, it } from "vitest";
import type { CalendarAgendaEvent } from "./calendarAgenda";
import {
  layoutWeekTimedEvents,
  weekSlotFromPointer,
  WEEK_HOUR_HEIGHT,
} from "./calendarWeek";

function event(
  id: string,
  startsAt: string,
  endsAt: string,
): CalendarAgendaEvent {
  return {
    id,
    sourceLabel: "Event",
    title: id,
    siteKey: "__events__",
    siteLabel: "Events",
    startsAt,
    endsAt,
    summary: "",
    detailLines: [],
  };
}

describe("calendar week layout", () => {
  const weekDays = [
    "2026-07-13",
    "2026-07-14",
    "2026-07-15",
    "2026-07-16",
    "2026-07-17",
    "2026-07-18",
    "2026-07-19",
  ];

  it("shares width only inside an overlapping cluster", () => {
    const items = layoutWeekTimedEvents([
      event("long", "2026-07-13T09:00:00", "2026-07-13T11:00:00"),
      event("overlap", "2026-07-13T09:30:00", "2026-07-13T10:30:00"),
      event("later", "2026-07-13T12:00:00", "2026-07-13T13:00:00"),
    ], weekDays);

    expect(items.find((item) => item.event.id === "long")).toMatchObject({
      column: 0,
      columnCount: 2,
    });
    expect(items.find((item) => item.event.id === "overlap")).toMatchObject({
      column: 1,
      columnCount: 2,
    });
    expect(items.find((item) => item.event.id === "later")).toMatchObject({
      column: 0,
      columnCount: 1,
    });
  });

  it("splits an overnight event into a segment on each day", () => {
    const items = layoutWeekTimedEvents(
      [event("overnight", "2026-07-13T23:00:00", "2026-07-14T01:00:00")],
      weekDays,
    );

    expect(
      items.map(({ dayKey, startMinutes, endMinutes }) => ({
        dayKey,
        startMinutes,
        endMinutes,
      })),
    ).toEqual([
      {
        dayKey: "2026-07-13",
        startMinutes: 23 * 60,
        endMinutes: 24 * 60,
      },
      {
        dayKey: "2026-07-14",
        startMinutes: 0,
        endMinutes: 60,
      },
    ]);
  });

  it("keeps the visible segment when an event crosses into the week", () => {
    const items = layoutWeekTimedEvents(
      [event("boundary", "2026-07-12T23:00:00", "2026-07-13T01:00:00")],
      weekDays,
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      dayKey: "2026-07-13",
      startMinutes: 0,
      endMinutes: 60,
    });
  });

  it("rounds pointer selection down to a quarter-hour slot", () => {
    expect(
      weekSlotFromPointer("2026-07-13", WEEK_HOUR_HEIGHT * 9.4, 0),
    ).toEqual({
      dayKey: "2026-07-13",
      startMinutes: 9 * 60 + 15,
      endMinutes: 10 * 60 + 15,
    });
  });
});
