import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CalendarAgenda from "./CalendarAgenda.vue";
import type { CalendarAgendaEvent } from "./calendarAgenda";

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
