import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import DatePickerPopover from "./DatePickerPopover.vue";

describe("DatePickerPopover", () => {
  it("uses a context-specific accessible label for marked dates", () => {
    const wrapper = mount(DatePickerPopover, {
      props: {
        monthKey: "2026-08",
        selectedDate: "2026-08-29",
        todayDate: "2026-08-29",
        markedDates: ["2026-08-29"],
        markedDateLabel: "calendar items scheduled",
      },
    });

    expect(
      wrapper.get('.date-picker-popover__day[aria-pressed="true"]').attributes("aria-label"),
    ).toContain("calendar items scheduled");
  });
});
