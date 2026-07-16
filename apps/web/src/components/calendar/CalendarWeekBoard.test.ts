import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CalendarWeekBoard from "./CalendarWeekBoard.vue";
import type { CalendarAgendaEvent } from "./calendarAgenda";
import { WEEK_HOUR_HEIGHT } from "./calendarWeek";

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
    color: "#fdd663",
    summary: "",
    detailLines: [],
  };
}

describe("CalendarWeekBoard", () => {
  it("uses labelled groups instead of a malformed ARIA grid", () => {
    const wrapper = mount(CalendarWeekBoard, {
      props: {
        weekStart: new Date(2026, 6, 13),
        events: [],
        todayDayKey: "2026-07-15",
      },
    });

    expect(wrapper.get(".week-time-grid").attributes("role")).toBe("group");
    expect(wrapper.get(".week-time-grid").attributes("aria-label")).toBe(
      "Timed events",
    );
    expect(wrapper.find('[role="grid"]').exists()).toBe(false);
    expect(
      wrapper
        .findAll(".week-day-column")
        .every((column) => column.attributes("role") === "group"),
    ).toBe(true);
  });

  it("renders timed collisions side by side and emits a quarter-hour slot", async () => {
    const wrapper = mount(CalendarWeekBoard, {
      props: {
        weekStart: new Date(2026, 6, 13),
        events: [
          event("first", "2026-07-13T09:00:00", "2026-07-13T11:00:00"),
          event("second", "2026-07-13T09:30:00", "2026-07-13T10:30:00"),
        ],
        todayDayKey: "2026-07-15",
      },
    });

    const timedEvents = wrapper.findAll(".week-timed-event");
    expect(timedEvents).toHaveLength(2);
    expect(timedEvents[0]?.attributes("style")).toContain("50%");
    expect(timedEvents[1]?.attributes("style")).toContain("50%");

    const monday = wrapper.get('[data-week-day="2026-07-13"]');
    monday.element.getBoundingClientRect = () =>
      ({
        top: 100,
        right: 240,
        bottom: 1636,
        left: 120,
        width: 120,
        height: 1536,
        x: 120,
        y: 100,
        toJSON: () => ({}),
      }) as DOMRect;
    await monday.trigger("click", {
      clientY: 100 + WEEK_HOUR_HEIGHT * 9.4,
    });

    expect(wrapper.emitted("select-slot")?.[0]?.[0]).toEqual({
      dayKey: "2026-07-13",
      startMinutes: 9 * 60 + 15,
      endMinutes: 10 * 60 + 15,
    });
  });

  it("supports arrow-key time selection before creating", async () => {
    const wrapper = mount(CalendarWeekBoard, {
      props: {
        weekStart: new Date(2026, 6, 13),
        events: [],
        todayDayKey: "2026-07-15",
      },
      attachTo: document.body,
    });
    const monday = wrapper.get('[data-week-day="2026-07-13"]');
    await monday.trigger("focus");
    await monday.trigger("keydown", { key: "ArrowDown" });
    await monday.trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("select-slot")?.[0]?.[0]).toMatchObject({
      dayKey: "2026-07-13",
      startMinutes: 9 * 60 + 30,
      endMinutes: 10 * 60 + 30,
    });
    wrapper.unmount();
  });

  it("uses a sibling native button for accessible all-day creation", async () => {
    const wrapper = mount(CalendarWeekBoard, {
      props: {
        weekStart: new Date(2026, 6, 13),
        events: [
          {
            ...event(
              "all-day",
              "2026-07-13T00:00:00",
              "2026-07-14T00:00:00",
            ),
            allDay: true,
          },
        ],
        todayDayKey: "2026-07-15",
      },
    });
    const monday = wrapper.findAll(".week-all-day-cell")[0];
    const create = monday?.get(".week-all-day-create");
    const allDayEvent = monday?.get(".week-all-day-event");
    expect(monday?.attributes("role")).toBe("group");
    expect(monday?.attributes("tabindex")).toBeUndefined();
    expect(create?.element.tagName).toBe("BUTTON");
    expect(create?.attributes("type")).toBe("button");
    expect(create?.element.contains(allDayEvent?.element)).toBe(false);
    expect(allDayEvent?.element.parentElement).toBe(monday?.element);
    await create?.trigger("click");

    expect(wrapper.emitted("select-slot")?.[0]?.[0]).toEqual({
      dayKey: "2026-07-13",
      startMinutes: 0,
      endMinutes: 24 * 60,
      allDay: true,
    });
  });
});
