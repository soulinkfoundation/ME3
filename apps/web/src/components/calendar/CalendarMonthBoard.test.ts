import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CalendarMonthBoard from "./CalendarMonthBoard.vue";
import type { CalendarAgendaEvent } from "./calendarAgenda";

function eventAt(hour: number): CalendarAgendaEvent {
  return {
    id: `event-${hour}`,
    sourceLabel: "Event",
    title: `Event ${hour}`,
    siteKey: "__events__",
    siteLabel: "Personal events",
    startsAt: new Date(2026, 6, 15, hour).toISOString(),
    endsAt: new Date(2026, 6, 15, hour + 1).toISOString(),
    summary: "",
    detailLines: [],
  };
}

describe("CalendarMonthBoard", () => {
  it("reveals an overflowing day without starting event creation", async () => {
    const wrapper = mount(CalendarMonthBoard, {
      props: {
        year: 2026,
        month: 6,
        events: [8, 9, 10, 11, 12].map(eventAt),
        todayDayKey: "2026-07-15",
      },
    });

    const more = wrapper.get(".board-more");
    expect(more.text()).toContain("+1 more");
    await more.trigger("click");

    expect(wrapper.emitted("show-day")).toEqual([["2026-07-15"]]);
    expect(wrapper.emitted("select-day")).toBeUndefined();
  });
});
