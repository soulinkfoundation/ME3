import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CalendarAgenda from "./CalendarAgenda.vue";
import type { CalendarAgendaEvent } from "./calendarAgenda";
import { calendarActivityDateKeys } from "./calendarAgenda";

const events: CalendarAgendaEvent[] = [
  {
    id: "event-1",
    entryType: "event",
    sourceLabel: "Event",
    title: "Design review",
    siteKey: "__events__",
    siteLabel: "Personal events",
    startsAt: "2026-07-15T10:00:00.000Z",
    endsAt: "2026-07-15T10:30:00.000Z",
    summary: "Design review",
    detailLines: [],
  },
  {
    id: "event-2",
    entryType: "reminder",
    sourceLabel: "Reminder",
    title: "Send update",
    siteKey: "__reminders__",
    siteLabel: "Reminders",
    startsAt: "2026-07-17T12:00:00.000Z",
    endsAt: "2026-07-17T12:05:00.000Z",
    summary: "Send update",
    detailLines: [],
  },
];

describe("CalendarAgenda", () => {
  it("renders only event-bearing days and marks today and a saved item", () => {
    const wrapper = mount(CalendarAgenda, {
      props: {
        events,
        rangeMode: "schedule",
        startDayKey: "2026-07-14",
        endDayKey: "2026-07-20",
        todayDayKey: "2026-07-15",
        highlightedEventId: "event-2",
      },
    });

    expect(wrapper.findAll(".calendar-day")).toHaveLength(2);
    expect(wrapper.text()).toContain("Today");
    expect(wrapper.text()).not.toContain("No items");
    expect(wrapper.find(".calendar-item.is-highlighted").exists()).toBe(true);
  });

  it("emits selected events while allowing compact layouts to use a modal", async () => {
    const wrapper = mount(CalendarAgenda, {
      props: {
        events: [events[0]!],
        rangeMode: "schedule",
        showInlineDetail: false,
      },
    });

    await wrapper.get(".calendar-item").trigger("click");

    expect(wrapper.emitted("select-event")?.[0]).toEqual([events[0]]);
    expect(wrapper.find(".calendar-detail").exists()).toBe(false);
  });

  it("offers a useful empty state and emits load-more", async () => {
    const wrapper = mount(CalendarAgenda, {
      props: {
        events: [],
        rangeMode: "schedule",
        canLoadMore: true,
      },
    });

    expect(wrapper.text()).toContain("No upcoming items in this window");
    const loadMore = wrapper.get(".calendar-load-more");
    expect(loadMore.text()).toBe("Look further ahead");
    await loadMore.trigger("click");
    expect(wrapper.emitted("load-more")).toHaveLength(1);
  });

  it("keeps one Today anchor without rendering every empty day", () => {
    const wrapper = mount(CalendarAgenda, {
      props: {
        events: [events[1]!],
        rangeMode: "schedule",
        startDayKey: "2026-07-15",
        endDayKey: "2026-09-13",
        todayDayKey: "2026-07-15",
      },
    });

    expect(wrapper.findAll(".calendar-day")).toHaveLength(2);
    expect(wrapper.text()).toContain("Today");
    expect(wrapper.findAll(".calendar-day-empty")).toHaveLength(1);
  });
});

function event(
  startsAt: string,
  endsAt: string,
): CalendarAgendaEvent {
  return {
    id: startsAt,
    sourceLabel: "Event",
    title: "Calendar item",
    siteKey: "__events__",
    siteLabel: "Events",
    startsAt,
    endsAt,
    summary: "",
    detailLines: [],
  };
}

describe("calendarActivityDateKeys", () => {
  it("marks every occupied local day without leaking an exclusive midnight end", () => {
    expect(
      calendarActivityDateKeys(
        [
          event("2026-08-12T22:00:00Z", "2026-08-14T00:00:00Z"),
          event("2026-08-18T09:00:00Z", "2026-08-18T09:00:00Z"),
        ],
        "UTC",
      ),
    ).toEqual(["2026-08-12", "2026-08-13", "2026-08-18"]);
  });

  it("uses the calendar display timezone", () => {
    expect(
      calendarActivityDateKeys(
        [event("2026-08-29T23:30:00Z", "2026-08-30T00:30:00Z")],
        "Europe/Dublin",
      ),
    ).toEqual(["2026-08-30"]);
  });
});
