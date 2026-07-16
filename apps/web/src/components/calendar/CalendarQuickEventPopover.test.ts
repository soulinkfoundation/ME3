import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CalendarQuickEventPopover from "./CalendarQuickEventPopover.vue";

describe("CalendarQuickEventPopover", () => {
  it("preserves the typed title when opening more options", async () => {
    const wrapper = mount(CalendarQuickEventPopover, {
      props: {
        slot: {
          dayKey: "2026-07-13",
          startMinutes: 9 * 60,
          endMinutes: 10 * 60,
        },
        anchor: {
          top: 100,
          right: 200,
          bottom: 120,
          left: 100,
          width: 100,
          height: 20,
        },
      },
      global: {
        stubs: { Teleport: true },
      },
    });

    await wrapper.get("input").setValue("Planning session");
    await wrapper.get(".more-options").trigger("click");

    expect(wrapper.emitted("more-options")).toEqual([["Planning session"]]);
  });
});
